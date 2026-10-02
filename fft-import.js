// Import de la liste des participants depuis l'export xlsx FFT (onglets
// "Tableau final" + "Liste d'attente"). Tout se fait dans le navigateur :
// le classeur est lu par SheetJS (vendor/xlsx.full.min.js, charge a la
// demande par script.js) et seules les donnees utiles au tournoi sont
// gardees (telephone pour l'envoi des convocations ; pas de mail ni de
// date de naissance).
;(function () {
  const FFT_DEFAULT_TEAMS = 16
  const FFT_MAIN_SHEET = 'Tableau final'
  const FFT_WAITING_SHEET = "Liste d'attente"

  // Ordre exact de l'export FFT (affiche tel quel dans les messages d'erreur).
  const FFT_COLUMNS = [
    "Nom de l'épreuve",
    "Catégorie de l'épreuve",
    'Position de la paire',
    'Nom joueur 1',
    'Prénom joueur 1',
    'Date de naissance joueur 1',
    'Licence joueur 1',
    'Club joueur 1',
    'Classement joueur 1',
    'Mail joueur 1',
    'Téléphone joueur 1',
    'Nom joueur 2',
    'Prénom joueur 2',
    'Date de naissance joueur 2',
    'Licence joueur 2',
    'Club joueur 2',
    'Classement joueur 2',
    'Mail joueur 2',
    'Téléphone joueur 2',
    'Poids paire',
  ]

  // Colonnes indispensables pour construire les equipes. Position et poids
  // servent au classement : il en faut au moins une des deux.
  const FFT_REQUIRED = [
    'Nom joueur 1', 'Prénom joueur 1', 'Club joueur 1', 'Classement joueur 1',
    'Nom joueur 2', 'Prénom joueur 2', 'Club joueur 2', 'Classement joueur 2',
  ]

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  function cell(v) {
    return v == null ? '' : String(v).trim()
  }

  // Excel peut stocker un 06... comme nombre (612345678) : le 0 initial est
  // perdu, on le remet pour les numeros francais a 9 chiffres.
  function phoneCell(v) {
    const s = cell(v)
    if (typeof v === 'number' && /^[1-9]\d{8}$/.test(s)) return '0' + s
    return s
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null
    const s = cell(v).replace(',', '.')
    if (!s) return null
    const n = Number(s)
    return isFinite(n) ? n : null
  }

  function findSheetName(workbook, wanted) {
    return workbook.SheetNames.find((n) => norm(n) === norm(wanted)) || null
  }

  // L'en-tete est normalement la 1ere ligne ; on tolere quelques lignes de
  // titre au-dessus en cherchant la 1ere ligne qui contient "Nom joueur 1".
  function readTable(XLSX, sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
    const headerIdx = rows.slice(0, 10).findIndex((r) => r.some((c) => norm(c) === norm('Nom joueur 1')))
    if (headerIdx === -1) return { headerIdx: -1, colIndex: {}, rows: [] }
    const colIndex = {}
    rows[headerIdx].forEach((c, i) => {
      const key = norm(c)
      if (key && !(key in colIndex)) colIndex[key] = i
    })
    return { headerIdx, colIndex, rows: rows.slice(headerIdx + 1) }
  }

  function isBlankRow(r) {
    return r.every((c) => cell(c) === '')
  }

  // Retourne { ok, teams, errors, warnings, waitingCount }. Les equipes sont
  // triees selon l'ordre officiel FFT (meilleure paire en 1er) et portent
  // fft.rank = 1..N, utilise par getRankedTeams() pour les tetes de serie.
  function parseFftWorkbook(XLSX, workbook, expectedTeams) {
    const expected = expectedTeams || FFT_DEFAULT_TEAMS
    const errors = []
    const warnings = []

    const mainName = findSheetName(workbook, FFT_MAIN_SHEET)
    if (!mainName) {
      errors.push(
        `Onglet « ${FFT_MAIN_SHEET} » introuvable (onglets présents : ${workbook.SheetNames.join(', ') || 'aucun'}).`
      )
      return { ok: false, teams: [], errors, warnings, waitingCount: 0 }
    }

    const table = readTable(XLSX, workbook.Sheets[mainName])
    const has = (name) => norm(name) in table.colIndex
    const missing = table.headerIdx === -1 ? FFT_REQUIRED.slice() : FFT_REQUIRED.filter((c) => !has(c))
    if (table.headerIdx !== -1 && !has('Position de la paire') && !has('Poids paire')) {
      missing.push('Position de la paire (ou Poids paire)')
    }
    if (missing.length) {
      errors.push(`Format de fichier non reconnu. Colonnes manquantes : ${missing.join(', ')}.`)
      errors.push(`Colonnes attendues (export FFT) : ${FFT_COLUMNS.join(' | ')}.`)
      return { ok: false, teams: [], errors, warnings, waitingCount: 0 }
    }

    const get = (r, name) => (has(name) ? r[table.colIndex[norm(name)]] : '')
    // Colonne telephone : l'intitule varie selon les fichiers ("Téléphone joueur 1",
    // "Numéro joueur 1", "Numéro de joueur 1", "Portable joueur 1"...). On
    // ecarte tout ce qui parle de licence ("Numéro de licence joueur 1").
    const phoneCol = (n) => {
      const key = Object.keys(table.colIndex).find(
        (k) => /(telephone|numero|portable|mobile|tel)/.test(k) && !/licence/.test(k) && new RegExp('joueur ?' + n + '$').test(k)
      )
      return key === undefined ? -1 : table.colIndex[key]
    }
    const phoneCols = { 1: phoneCol(1), 2: phoneCol(2) }
    const player = (r, n) => ({
      nom: cell(get(r, `Nom joueur ${n}`)),
      prenom: cell(get(r, `Prénom joueur ${n}`)),
      club: cell(get(r, `Club joueur ${n}`)),
      classement: cell(get(r, `Classement joueur ${n}`)),
      telephone: phoneCols[n] === -1 ? '' : phoneCell(r[phoneCols[n]]),
    })

    const dataRows = table.rows
      .map((r, i) => ({ r, line: table.headerIdx + 2 + i })) // numero de ligne Excel
      .filter(({ r }) => !isBlankRow(r))

    const teams = []
    dataRows.forEach(({ r, line }) => {
      const j1 = player(r, 1)
      const j2 = player(r, 2)
      if (!j1.nom || !j1.prenom || !j2.nom || !j2.prenom) {
        warnings.push(`Ligne ${line} ignorée : nom ou prénom de joueur manquant.`)
        return
      }
      teams.push({
        j1,
        j2,
        convocation: '',
        fft: { position: num(get(r, 'Position de la paire')), poids: num(get(r, 'Poids paire')) },
      })
    })

    if (dataRows.length !== expected) {
      errors.push(`Le fichier contient ${dataRows.length} paire${dataRows.length > 1 ? 's' : ''}, ${expected} attendues.`)
    } else if (teams.length < expected) {
      errors.push(`Seulement ${teams.length} paires valides sur ${expected} : import annulé.`)
    }

    // Tri : Position de la paire si elle est complete et sans doublon, sinon
    // Poids paire (croissant = meilleure paire), sinon ordre du fichier.
    const positions = teams.map((t) => t.fft.position)
    const poids = teams.map((t) => t.fft.poids)
    const positionsOk = positions.every((p) => p != null) && new Set(positions).size === positions.length
    const poidsOk = poids.every((p) => p != null)
    if (positionsOk) {
      teams.sort((a, b) => a.fft.position - b.fft.position)
    } else if (poidsOk) {
      teams.sort((a, b) => a.fft.poids - b.fft.poids)
      if (has('Position de la paire')) warnings.push('Colonne « Position de la paire » incomplète ou incohérente : tri par « Poids paire ».')
    } else if (teams.length) {
      warnings.push('Ni « Position de la paire » ni « Poids paire » exploitables : ordre du fichier conservé.')
    }
    teams.forEach((t, i) => (t.fft.rank = i + 1))

    let waitingCount = 0
    const waitingName = findSheetName(workbook, FFT_WAITING_SHEET)
    if (waitingName) {
      const w = readTable(XLSX, workbook.Sheets[waitingName])
      waitingCount = w.rows.filter((r) => !isBlankRow(r)).length
    }

    return { ok: errors.length === 0, teams, errors, warnings, waitingCount }
  }

  const api = { parseFftWorkbook, FFT_COLUMNS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else window.FftImport = api
})()
