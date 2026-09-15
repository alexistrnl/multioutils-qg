const addBtn = document.getElementById('add-team-btn')
const modalBackdrop = document.getElementById('team-modal-backdrop')
const list = document.getElementById('team-list')
const teamCount = document.getElementById('team-count')
const toggleBtn = document.getElementById('toggle-panel')
const detailsBackdrop = document.getElementById('team-details-backdrop')
const detailsTbody = document.getElementById('details-tbody')
const detailsConvocation = document.getElementById('details-convocation')

let tournaments = []
let activeTournamentId = null

// Format actuel unique : bracket padel a 16 equipes. Chaque format a son
// propre prefixe d'id/URL ("tournoi16-1", "tournoi16-2", ...) et son propre
// compteur dans formatCounters, pour pouvoir ajouter d'autres formats plus
// tard (ex. "tournoi32-1") sans collision ni renumerotation.
const DEFAULT_FORMAT = '16'
let formatCounters = {}

// Liste des types de tournoi proposes dans la modale "+ Nouveau tournoi".
// Ajouter un format ici (id unique + libelle) suffira a le faire apparaitre
// dans le choix, une fois son propre rendu de bracket branche.
const TOURNAMENT_FORMATS = [
  { id: '16', label: '16 équipes', description: 'Tableau à élimination directe, 16 équipes' },
  { id: '12', label: '12 équipes', description: 'Tableau à élimination directe, 12 équipes (4 exemptées)' },
  { id: '9', label: '9 équipes', description: 'Tournoi à 9 équipes (modèle à venir)' },
]

function createTournament(name, format) {
  format = format || DEFAULT_FORMAT
  formatCounters[format] = (formatCounters[format] || 0) + 1
  const id = `tournoi${format}-${formatCounters[format]}`
  tournaments.push({ id, name, format, teams: [], boxes: {} })
  return id
}

// Anciennes sauvegardes : id "tournoi-N" (avant l'introduction des formats).
// On les reecrit en "tournoi16-N" (seul format existant a l'epoque) pour
// qu'elles restent compatibles avec le nouveau schema d'URL.
function migrateLegacyTournamentIds() {
  tournaments.forEach((t) => {
    if (!t.format) t.format = DEFAULT_FORMAT
    const m = /^tournoi-(\d+)$/.exec(t.id)
    if (m) t.id = `tournoi${t.format}-${m[1]}`
  })
}

// formatCounters n'est pas persiste : on le reconstruit depuis les ids
// existants a chaque chargement, ce qui evite tout risque de desync.
function rebuildFormatCounters() {
  formatCounters = {}
  tournaments.forEach((t) => {
    const m = /^tournoi(\d+)-(\d+)$/.exec(t.id)
    if (!m) return
    const n = parseInt(m[2], 10)
    if (n > (formatCounters[m[1]] || 0)) formatCounters[m[1]] = n
  })
}

function getActiveTournament() {
  return tournaments.find((t) => t.id === activeTournamentId)
}

let dartsTournaments = []
let dartsCounter = 0

function createDartsTournament(name) {
  dartsCounter++
  const id = `flechettes-${dartsCounter}`
  dartsTournaments.push({ id, name })
  return id
}

// Persistance locale (pas de backend) : tout l'etat (tournois padel + leurs
// equipes/cases de bracket, tournois flechettes) est sauvegarde dans
// localStorage a chaque modification, pour survivre a un rafraichissement.
const STORAGE_KEY = 'qg-padel-state'

// Les structures flechettes (dartsPlayers, dartsSchedule, ...) sont declarees
// plus bas dans le fichier et remplies au chargement ; snapshotDartsState()
// n'est donc utilisable qu'une fois dartsReady=true (evite un crash si
// saveState() est appele avant, ce qui n'arrive qu'au tout premier lancement
// sans donnees sauvegardees). restoredDartsData recoit les donnees relues du
// localStorage, appliquees plus tard une fois les structures pretes.
let dartsReady = false
let restoredDartsData = null

function saveState() {
  const active = getActiveTournament()
  if (active) {
    if (active.format === DEFAULT_FORMAT) active.boxes = snapshotBoxes()
    else if (active.format === '12') active.boxes = snapshotT12Boxes()
    else if (active.format === '9') active.boxes = snapshotT9Boxes()
  }

  const data = { tournaments, dartsTournaments, dartsCounter }
  if (dartsReady) data.darts = snapshotDartsState()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    // stockage indisponible (navigation privee, quota...) : on continue sans persistance
  }
}

function loadState() {
  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (e) {
    return false
  }
  if (!raw) return false

  try {
    const data = JSON.parse(raw)
    tournaments = data.tournaments || []
    dartsTournaments = data.dartsTournaments || []
    dartsCounter = data.dartsCounter || 0
    restoredDartsData = data.darts || null
    migrateLegacyTournamentIds()
    rebuildFormatCounters()
    return tournaments.length > 0 || dartsTournaments.length > 0
  } catch (e) {
    return false
  }
}

const UNRANKED = Number.POSITIVE_INFINITY

function classementValue(v) {
  const n = parseFloat(v)
  return isNaN(n) ? UNRANKED : n
}

function classementSum(team) {
  const a = classementValue(team.j1.classement)
  const b = classementValue(team.j2.classement)
  return a === UNRANKED || b === UNRANKED ? UNRANKED : a + b
}

function getRankedTeams() {
  return [...getActiveTournament().teams].sort((a, b) => {
    const sa = classementSum(a)
    const sb = classementSum(b)
    if (sa === sb) return 0
    if (sa === UNRANKED) return 1
    if (sb === UNRANKED) return -1
    return sa - sb
  })
}

const t12List = document.getElementById('t12-team-list')
const t12TeamCount = document.getElementById('t12-team-count')

function renderTeams12() {
  const active = getActiveTournament()
  t12List.innerHTML = ''

  const ranked = getRankedTeams()

  ranked.forEach((team, i) => {
    const rank = i + 1
    const isRed = rank <= 4
    const label = isRed ? `TS${rank}` : `${rank}`
    const li = document.createElement('li')
    li.textContent = `${label}. ${fullName(team.j1)} / ${fullName(team.j2)}`
    li.classList.add('team-item', isRed ? 'rank-red' : 'rank-yellow')
    li.addEventListener('click', () => showTeamDetails(team))
    t12List.appendChild(li)
  })

  const n = active.teams.length
  t12TeamCount.textContent = `${n} équipe${n > 1 ? 's' : ''}`
  saveState()
}

const t9List = document.getElementById('t9-team-list')
const t9TeamCount = document.getElementById('t9-team-count')

function renderTeams9() {
  const active = getActiveTournament()
  t9List.innerHTML = ''

  active.teams.forEach((team, i) => {
    const li = document.createElement('li')
    li.textContent = `${i + 1}. ${fullName(team.j1)} / ${fullName(team.j2)}`
    li.classList.add('team-item')
    li.addEventListener('click', () => showTeamDetails(team))
    t9List.appendChild(li)
  })

  const n = active.teams.length
  t9TeamCount.textContent = `${n} équipe${n > 1 ? 's' : ''}`
  saveState()
}

function renderTeams() {
  const format = getActiveTournament().format
  if (format === '12') {
    renderTeams12()
    return
  }
  if (format === '9') {
    renderTeams9()
    return
  }

  list.innerHTML = ''

  const ranked = getRankedTeams()

  ranked.forEach((team, i) => {
    const rank = i + 1
    const isRed = rank <= 8
    const label = isRed ? `TS${rank}` : `${rank}`
    const li = document.createElement('li')
    li.textContent = `${label}. ${fullName(team.j1)} / ${fullName(team.j2)}`
    li.classList.add('team-item', isRed ? 'rank-red' : 'rank-yellow')
    li.addEventListener('click', () => showTeamDetails(team))
    list.appendChild(li)
  })
  const n = getActiveTournament().teams.length
  teamCount.textContent = `${n} équipe${n > 1 ? 's' : ''}`

  fillFixedSeeds()
  saveState()
}

let editingTeam = null

function detailsRow(label, player) {
  const tr = document.createElement('tr')

  const labelTd = document.createElement('td')
  labelTd.textContent = label
  tr.appendChild(labelTd)
  ;['prenom', 'nom', 'club', 'classement'].forEach((field) => {
    const td = document.createElement('td')
    const input = document.createElement('input')
    input.type = 'text'
    input.dataset.field = field
    input.value = player[field] || ''
    td.appendChild(input)
    tr.appendChild(td)
  })
  return tr
}

function showTeamDetails(team) {
  editingTeam = team
  detailsTbody.innerHTML = ''
  detailsTbody.appendChild(detailsRow('Joueur 1', team.j1))
  detailsTbody.appendChild(detailsRow('Joueur 2', team.j2))
  detailsConvocation.value = team.convocation || ''
  detailsBackdrop.classList.remove('hidden')
}

function closeDetails() {
  editingTeam = null
  detailsBackdrop.classList.add('hidden')
}

document.getElementById('close-details-btn').addEventListener('click', closeDetails)

document.getElementById('save-team-btn').addEventListener('click', () => {
  if (!editingTeam) return
  const rows = detailsTbody.querySelectorAll('tr')
  const players = [editingTeam.j1, editingTeam.j2]

  rows.forEach((row, i) => {
    row.querySelectorAll('input').forEach((input) => {
      players[i][input.dataset.field] = input.value.trim()
    })
  })
  editingTeam.convocation = detailsConvocation.value

  renderTeams()
  closeDetails()
})

document.getElementById('delete-team-btn').addEventListener('click', () => {
  if (!editingTeam) return
  if (!confirm('Supprimer cette équipe ?')) return

  const active = getActiveTournament()
  active.teams = active.teams.filter((t) => t !== editingTeam)
  renderTeams()
  closeDetails()
})

toggleBtn.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('panel-collapsed')
  toggleBtn.textContent = collapsed ? '›' : '‹'
})

function closeModal() {
  modalBackdrop.classList.add('hidden')
  modalBackdrop.querySelectorAll('input').forEach((input) => (input.value = ''))
}

addBtn.addEventListener('click', () => {
  modalBackdrop.classList.remove('hidden')
})

document.getElementById('cancel-team-btn').addEventListener('click', closeModal)

document.getElementById('validate-team-btn').addEventListener('click', () => {
  const j1 = {
    nom: document.getElementById('j1-nom').value.trim(),
    prenom: document.getElementById('j1-prenom').value.trim(),
    club: document.getElementById('j1-club').value.trim(),
    classement: document.getElementById('j1-classement').value.trim(),
  }
  const j2 = {
    nom: document.getElementById('j2-nom').value.trim(),
    prenom: document.getElementById('j2-prenom').value.trim(),
    club: document.getElementById('j2-club').value.trim(),
    classement: document.getElementById('j2-classement').value.trim(),
  }
  const convocation = document.getElementById('convocation').value

  if (!j1.prenom || !j2.prenom) return

  getActiveTournament().teams.push({ j1, j2, convocation })
  renderTeams()
  closeModal()
})

function fillColumn(id, count) {
  const col = document.getElementById(id)
  for (let i = 0; i < count; i++) {
    const box = document.createElement('div')
    box.className = 'bracket-box'
    box.dataset.box = `${id}-${i}`
    col.appendChild(box)
  }
}

fillColumn('round-1', 8)
fillColumn('round-2', 8)
fillColumn('round-3', 8)
fillColumn('round-4', 4)
fillColumn('round-5', 3)
document.querySelector('[data-box="round-5-2"]').classList.add('offset-right')

const bracketColumns = document.getElementById('bracket-columns')
const connectorsSvg = document.getElementById('connectors-svg')

const PAIRS = [
  { from: [0, 1], to: 1 },
  { from: [2, 3], to: 3 },
  { from: [4, 5], to: 5 },
  { from: [6, 7], to: 7 },
]

const PAIRS_TO_4 = [
  { from: [0, 1], to: 0 },
  { from: [2, 3], to: 1 },
  { from: [4, 5], to: 2 },
  { from: [6, 7], to: 3 },
]

const PAIRS_TO_2 = [
  { from: [0, 1], to: 0 },
  { from: [2, 3], to: 1 },
]

const LINKS = [
  { from: 'round-1', to: 'round-2', pairs: PAIRS },
  { from: 'round-2', to: 'round-3', pairs: PAIRS },
  { from: 'round-3', to: 'round-4', pairs: PAIRS_TO_4, align: true },
  { from: 'round-4', to: 'round-5', pairs: PAIRS_TO_2, align: true },
]

// Case du milieu de round-5 : positionnee entre les deux autres de la meme
// colonne et reliee a elles par des traits verticaux (pas de colonne a droite).
const MIDPOINT_LINKS = [{ col: 'round-5', from: [0, 1], to: 2 }]

function positionMidpointBoxes() {
  for (const link of MIDPOINT_LINKS) {
    const col = document.getElementById(link.col)
    const colRect = col.getBoundingClientRect()

    const centers = link.from
      .map((idx) => col.querySelector(`[data-box="${link.col}-${idx}"]`))
      .filter(Boolean)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return r.top + r.height / 2
      })
    if (!centers.length) continue

    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length
    const targetBox = col.querySelector(`[data-box="${link.col}-${link.to}"]`)
    if (!targetBox) continue

    const boxHeight = targetBox.getBoundingClientRect().height
    targetBox.style.top = `${avgCenter - colRect.top - boxHeight / 2}px`
  }
}

function verticalConnectorLines(containerRect) {
  const lines = []
  for (const link of MIDPOINT_LINKS) {
    const mid = document.querySelector(`[data-box="${link.col}-${link.to}"]`)
    if (!mid) continue
    const midRect = mid.getBoundingClientRect()
    const x = midRect.left + midRect.width / 2 - containerRect.left
    const midTop = midRect.top - containerRect.top
    const midBottom = midRect.bottom - containerRect.top

    for (const idx of link.from) {
      const el = document.querySelector(`[data-box="${link.col}-${idx}"]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const isAbove = r.top + r.height / 2 < midRect.top + midRect.height / 2
      const y = (isAbove ? r.bottom : r.top) - containerRect.top
      const y2 = isAbove ? midTop : midBottom
      lines.push({ x, y, x2: x, y2 })
    }
  }
  return lines
}

function positionAlignedBoxes() {
  for (const link of LINKS) {
    if (!link.align) continue
    const col = document.getElementById(link.to)
    const colRect = col.getBoundingClientRect()

    for (const pair of link.pairs) {
      const centers = pair.from
        .map((idx) => bracketColumns.querySelector(`[data-box="${link.from}-${idx}"]`))
        .filter(Boolean)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return r.top + r.height / 2
        })
      if (!centers.length) continue

      const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length
      const targetBox = col.querySelector(`[data-box="${link.to}-${pair.to}"]`)
      if (!targetBox) continue

      const boxHeight = targetBox.getBoundingClientRect().height
      targetBox.style.top = `${avgCenter - colRect.top - boxHeight / 2}px`
    }
  }
}

function drawConnectors() {
  // Neutralise le temps du calcul le transform des cases en cours de
  // "pop-in" : sinon getBoundingClientRect() les mesure retrecies (etat de
  // depart de l'animation) et les traits/positions qui en dependent sont faux.
  const animating = Array.from(document.querySelectorAll('.bracket-box.pop-in'))
  animating.forEach((box) => box.classList.add('measuring'))

  positionAlignedBoxes()
  positionMidpointBoxes()

  const containerRect = bracketColumns.getBoundingClientRect()

  const anchor = (selector, side) => {
    const el = bracketColumns.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: (side === 'right' ? r.right : r.left) - containerRect.left,
      y: r.top + r.height / 2 - containerRect.top,
    }
  }

  const incoming = {}
  const outgoing = {}
  const hasIncomingLink = new Set()
  const lines = []

  for (const link of LINKS) {
    hasIncomingLink.add(link.to)
    incoming[link.to] = incoming[link.to] || new Set()
    outgoing[link.from] = outgoing[link.from] || new Set()

    for (const pair of link.pairs) {
      const to = anchor(`[data-box="${link.to}-${pair.to}"]`, 'left')
      if (!to) continue
      incoming[link.to].add(pair.to)
      for (const idx of pair.from) {
        outgoing[link.from].add(idx)
        const from = anchor(`[data-box="${link.from}-${idx}"]`, 'right')
        if (from) lines.push({ ...from, x2: to.x, y2: to.y })
      }
    }
  }

  for (const link of MIDPOINT_LINKS) {
    incoming[link.col] = incoming[link.col] || new Set()
    incoming[link.col].add(link.to)
    hasIncomingLink.add(link.col)
  }
  lines.push(...verticalConnectorLines(containerRect))

  const allCols = new Set([...Object.keys(incoming), ...Object.keys(outgoing)])
  allCols.forEach((colId) => {
    const set = hasIncomingLink.has(colId) ? incoming[colId] || new Set() : outgoing[colId] || new Set()
    bracketColumns.querySelectorAll(`#${colId} .bracket-box`).forEach((box, i) => {
      box.classList.toggle('connected', set.has(i))
    })
  })

  connectorsSvg.innerHTML = lines
    .map((l) => `<line x1="${l.x}" y1="${l.y}" x2="${l.x2}" y2="${l.y2}" class="connector-line" />`)
    .join('')

  animating.forEach((box) => box.classList.remove('measuring'))
}

drawConnectors()
window.addEventListener('resize', drawConnectors)

// Table box-cible -> [box-source1, box-source2], deduite des memes LINKS /
// MIDPOINT_LINKS que les connecteurs, pour savoir quelles cases sont
// cliquables et quelles equipes s'affrontent.
const BOX_SOURCES = {}
for (const link of LINKS) {
  for (const pair of link.pairs) {
    BOX_SOURCES[`${link.to}-${pair.to}`] = pair.from.map((idx) => `${link.from}-${idx}`)
  }
}
for (const link of MIDPOINT_LINKS) {
  BOX_SOURCES[`${link.col}-${link.to}`] = link.from.map((idx) => `${link.col}-${idx}`)
}

document.querySelectorAll('.bracket-box').forEach((box) => {
  if (BOX_SOURCES[box.dataset.box]) box.classList.add('pickable')
})

const winnerModalBackdrop = document.getElementById('winner-modal-backdrop')
const winnerModalTitle = document.getElementById('winner-modal-title')
const winnerChoices = document.getElementById('winner-choices')

function closeWinnerModal() {
  winnerModalBackdrop.classList.add('hidden')
}

document.getElementById('cancel-winner-btn').addEventListener('click', closeWinnerModal)

function openPicker(options, title = '') {
  winnerModalTitle.textContent = title
  winnerModalTitle.hidden = !title

  winnerChoices.innerHTML = ''
  options.forEach((opt) => {
    const btn = document.createElement('button')
    btn.textContent = opt.label
    btn.addEventListener('click', () => {
      opt.onPick()
      closeWinnerModal()
    })
    winnerChoices.appendChild(btn)
  })
  winnerModalBackdrop.classList.remove('hidden')
}

function popIn(box) {
  box.classList.remove('pop-in')
  void box.offsetWidth
  box.classList.add('pop-in')
}

function fillBoxWithTeam(box, team) {
  box.textContent = `${shortName(team.j1)} / ${shortName(team.j2)}`
  popIn(box)
  saveState()
}

function showWinnerPicker(targetBox, sourceEls) {
  const options = sourceEls.map((el) => ({
    label: el.textContent,
    onPick: () => {
      targetBox.textContent = el.textContent
      if (targetBox.dataset.box === 'round-5-2' || targetBox.dataset.t12Box === 'col5-1') {
        targetBox.classList.add('champion')
      }
      popIn(targetBox)
      saveState()
    },
  }))
  openPicker(options, 'Qui a gagné ?')
}

bracketColumns.addEventListener('click', (e) => {
  const box = e.target.closest('.bracket-box')
  if (!box) return

  const sources = BOX_SOURCES[box.dataset.box]
  if (!sources) return

  const sourceEls = sources.map((id) => bracketColumns.querySelector(`[data-box="${id}"]`)).filter(Boolean)
  if (sourceEls.length < 2 || sourceEls.some((el) => !el.textContent.trim())) return

  showWinnerPicker(box, sourceEls)
})

// Remplissage manuel des cases rouges (non reliees) : colonne 2 -> choix parmi
// TS5 a TS8, colonne 3 -> uniquement les 2 cases du milieu, choix entre TS3 et
// TS4 (TS1/TS2 sont fixes, cf fillFixedSeeds ci-dessous).
function tsLabel(rank, team) {
  return `TS${rank} — ${shortName(team.j1)} / ${shortName(team.j2)}`
}

function showTsPicker(box, ranks) {
  const ranked = getRankedTeams()
  const options = ranks
    .map((rank) => {
      const team = ranked[rank - 1]
      if (!team) return null
      return { label: tsLabel(rank, team), onPick: () => fillBoxWithTeam(box, team) }
    })
    .filter(Boolean)
  if (options.length) openPicker(options)
}

document.querySelectorAll('#round-2 .bracket-box').forEach((box, i) => {
  if (![0, 2, 4, 6].includes(i)) return
  box.classList.add('pickable')
  box.addEventListener('click', () => showTsPicker(box, [5, 6, 7, 8]))
})

document.querySelectorAll('#round-3 .bracket-box').forEach((box, i) => {
  if (![2, 4].includes(i)) return
  box.classList.add('pickable')
  box.addEventListener('click', () => showTsPicker(box, [3, 4]))
})

// TS1 (bas) et TS2 (haut) de la colonne 3 sont deterministes (dependent
// uniquement du classement courant) : on les inscrit directement, sans
// attendre un clic ni le bouton "Completer 3eme tour".
function fillFixedSeeds() {
  const ranked = getRankedTeams()
  const allBoxes = Array.from(document.querySelectorAll('#round-3 .bracket-box'))
  ;[
    [allBoxes[0], ranked[1]],
    [allBoxes[6], ranked[0]],
  ].forEach(([box, team]) => {
    if (!box || !team) return
    const text = `${shortName(team.j1)} / ${shortName(team.j2)}`
    if (box.textContent === text) return
    box.textContent = text
    popIn(box)
  })
}

const FAKE_PRENOMS = [
  'Jean', 'Marie', 'Paul', 'Sophie', 'Luc', 'Claire', 'Marc', 'Julie', 'Thomas', 'Emma',
  'Nicolas', 'Laura', 'Antoine', 'Camille', 'David', 'Sarah', 'Pierre', 'Léa', 'Julien', 'Manon',
  'Alex', 'Chloé', 'Hugo', 'Anaïs', 'Simon', 'Inès', 'Romain', 'Lisa', 'Maxime', 'Eva',
  'Kevin', 'Nina',
]
const FAKE_NOMS = [
  'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon',
  'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel',
  'Girard', 'Andre', 'Lefevre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'Francois', 'Martinez', 'Legrand',
  'Garnier', 'Faure',
]
const FAKE_CLUBS = ['QG Padel', 'Padel Attitude', 'Set Point', 'Padel Club Nice', 'Riviera Padel', 'Ace Padel', 'Smash Club']

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateFakeTeams(count) {
  const teams = []
  for (let i = 0; i < count; i++) {
    const makePlayer = () => ({
      nom: randomItem(FAKE_NOMS),
      prenom: randomItem(FAKE_PRENOMS),
      club: randomItem(FAKE_CLUBS),
      classement: String(Math.floor(Math.random() * 30) + 1),
    })
    const hh = String(Math.floor(Math.random() * 4) + 9).padStart(2, '0')
    const mm = randomItem(['00', '15', '30', '45'])
    teams.push({ j1: makePlayer(), j2: makePlayer(), convocation: `${hh}:${mm}` })
  }
  return teams
}

if (!loadState()) {
  activeTournamentId = createTournament('Tournoi 1')
  getActiveTournament().teams.push(...generateFakeTeams(16))
  renderTeams()
}

// Menu "mes tournois" : chaque tournoi garde son propre tableau (equipes +
// contenu des cases du bracket, sauvegarde/restaure a chaque changement).
function snapshotBoxes() {
  const snap = {}
  document.querySelectorAll('.bracket-box').forEach((box) => {
    snap[box.dataset.box] = { text: box.textContent, champion: box.classList.contains('champion') }
  })
  return snap
}

function restoreBoxes(snap) {
  document.querySelectorAll('.bracket-box').forEach((box) => {
    const s = snap && snap[box.dataset.box]
    box.textContent = s ? s.text : ''
    box.classList.toggle('champion', !!(s && s.champion))
    box.classList.remove('pop-in')
  })
}

function snapshotT12Boxes() {
  const snap = {}
  document.querySelectorAll('.t12-box').forEach((box) => {
    snap[box.dataset.t12Box] = { text: box.textContent }
  })
  return snap
}

function restoreT12Boxes(snap) {
  document.querySelectorAll('.t12-box').forEach((box) => {
    const s = snap && snap[box.dataset.t12Box]
    box.textContent = s ? s.text : ''
    box.classList.remove('pop-in')
  })
}

function snapshotT9Boxes() {
  const snap = {}
  document.querySelectorAll('.t9-box').forEach((box) => {
    snap[box.dataset.t9Box] = { text: boxTextTarget(box).textContent }
  })
  return snap
}

function restoreT9Boxes(snap) {
  document.querySelectorAll('.t9-box').forEach((box) => {
    const s = snap && snap[box.dataset.t9Box]
    boxTextTarget(box).textContent = s ? s.text : ''
    box.classList.remove('pop-in')
  })
}

const homeBtn = document.getElementById('home-btn')
const homePage = document.getElementById('home-page')
const tournamentView = document.getElementById('tournament-view')
const tournamentListPage = document.getElementById('tournament-list-page')
const dartsView = document.getElementById('darts-view')
const dartsLaunchBtn = document.getElementById('darts-launch-btn')
const dartsTournamentTitle = document.getElementById('darts-tournament-title')
const dartsResultsPanel = document.getElementById('darts-results-panel')
const dartsResultsToggleBtn = document.getElementById('darts-results-toggle-btn')
const tournament12View = document.getElementById('tournament12-view')
const tournament9View = document.getElementById('tournament9-view')

dartsResultsToggleBtn.addEventListener('click', () => {
  const collapsed = dartsResultsPanel.classList.toggle('collapsed')
  dartsResultsToggleBtn.classList.toggle('collapsed', collapsed)
  dartsResultsToggleBtn.textContent = collapsed ? '‹' : '›'
})

// Routage cote client (pas de backend) : /accueil pour la page d'accueil,
// /tournoi<format>-N pour le tournoi padel dont l'id est "tournoi<format>-N"
// (ex. "tournoi16-1" pour le 1er tournoi du format a 16 equipes), /tournoiflechettesN
// pour le tournoi de flechettes dont l'id est "flechettes-N". Le serveur sert
// index.html pour n'importe quel chemin sans extension (cf server.js), donc
// une URL tapee directement ou rafraichie fonctionne aussi.
function tournamentNumber(id) {
  return id.split('-')[1]
}

function tournamentUrl(id) {
  return `/${id}`
}

function dartsUrl(id) {
  return `/tournoiflechettes${tournamentNumber(id)}`
}

function navigateTo(path, replace) {
  if (replace) history.replaceState({}, '', path)
  else history.pushState({}, '', path)
  renderRoute()
}

function renderRoute() {
  const path = location.pathname

  const dartsMatch = path.match(/^\/tournoiflechettes(\d+)$/)
  if (dartsMatch) {
    const t = dartsTournaments.find((d) => tournamentNumber(d.id) === dartsMatch[1])
    if (t) {
      showDartsView(t)
      return
    }
  }

  const match = path.match(/^\/tournoi(\d+)-(\d+)$/)
  if (match) {
    const id = `tournoi${match[1]}-${match[2]}`
    const t = tournaments.find((tour) => tour.id === id)
    if (t) {
      if (t.format === DEFAULT_FORMAT) {
        switchTournament(id)
        showTournamentView()
      } else {
        if (id !== activeTournamentId) {
          leaveActiveTournamentView()
          activeTournamentId = id
        }
        if (t.format === '12') {
          showTournament12View(t)
        } else if (t.format === '9') {
          showTournament9View(t)
        }
      }
      return
    }
  }

  if (path === '/accueil') {
    showHomePage()
    return
  }

  // Chemin inconnu (ou racine "/") : on retombe sur l'accueil.
  navigateTo('/accueil', true)
}

function showHomePage() {
  renderTournamentMenu()
  renderDartsMenu()
  tournamentView.classList.add('hidden')
  dartsView.classList.add('hidden')
  tournament12View.classList.add('hidden')
  tournament9View.classList.add('hidden')
  homePage.classList.remove('hidden')
}

let activeDartsTournament = null

function showDartsView(t) {
  activeDartsTournament = t
  dartsTournamentTitle.textContent = 'Tournoi de fléchettes'
  homePage.classList.add('hidden')
  tournamentView.classList.add('hidden')
  tournament12View.classList.add('hidden')
  tournament9View.classList.add('hidden')
  dartsView.classList.remove('hidden')
  checkAllPoulesFinalized()
}

function showTournament12View(t) {
  homePage.classList.add('hidden')
  dartsView.classList.add('hidden')
  tournamentView.classList.add('hidden')
  tournament9View.classList.add('hidden')
  tournament12View.classList.remove('hidden')
  restoreT12Boxes(t.boxes)
  renderTeams()
  // Le tableau vient peut-etre d'etre affiche apres avoir ete display:none :
  // les positions calculees pendant qu'il etait cache sont fausses, il faut
  // refaire le calcul une fois qu'il est visible.
  drawT12Connectors()
}

function showTournament9View(t) {
  homePage.classList.add('hidden')
  dartsView.classList.add('hidden')
  tournamentView.classList.add('hidden')
  tournament12View.classList.add('hidden')
  tournament9View.classList.remove('hidden')
  restoreT9Boxes(t.boxes)
  renderTeams()
  renderT9Rankings()
  renderT9Schedule()
  renderT9Indicators()
  renderT9PointDiffs()
}

// Chaque lien relie une colonne source a une colonne cible : chaque "pair"
// fait converger 2 cases source (from) vers 1 case cible (to). Pour ajouter
// une colonne suivante, ajouter un lien { from: '<col>', to: '<col>', pairs }.
const T12_LINKS = [
  {
    from: 'left',
    to: 'right',
    pairs: [
      { from: [1, 2], to: 2 },
      { from: [3, 4], to: 4 },
      { from: [5, 6], to: 6 },
      { from: [7, 8], to: 8 },
    ],
  },
  {
    from: 'right',
    to: 'col3',
    pairs: [
      { from: [1, 2], to: 1 },
      { from: [3, 4], to: 2 },
      { from: [5, 6], to: 3 },
      { from: [7, 8], to: 4 },
    ],
  },
  {
    from: 'col3',
    to: 'col4',
    pairs: [
      { from: [1, 2], to: 1 },
      { from: [3, 4], to: 2 },
    ],
  },
  {
    from: 'col4',
    to: 'col5',
    pairs: [{ from: [1, 2], to: 1 }],
  },
]

function drawT12Connectors() {
  const container = document.querySelector('.t12-columns')
  const svg = document.getElementById('t12-connectors-svg')
  if (!container || !svg) return

  const connected = new Set()
  T12_LINKS.forEach((link) => {
    link.pairs.forEach((pair) => {
      connected.add(`${link.to}-${pair.to}`)
      pair.from.forEach((idx) => connected.add(`${link.from}-${idx}`))
    })
  })
  container.querySelectorAll('.t12-box').forEach((box) => {
    box.classList.toggle('connected', connected.has(box.dataset.t12Box))
  })

  const containerRect = container.getBoundingClientRect()

  const anchor = (boxName, side) => {
    const el = container.querySelector(`[data-t12-box="${boxName}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: (side === 'right' ? r.right : r.left) - containerRect.left,
      y: r.top + r.height / 2 - containerRect.top,
    }
  }

  const lines = []
  T12_LINKS.forEach((link) => {
    link.pairs.forEach((pair) => {
      const to = anchor(`${link.to}-${pair.to}`, 'left')
      if (!to) return
      pair.from.forEach((idx) => {
        const from = anchor(`${link.from}-${idx}`, 'right')
        if (from) lines.push({ ...from, x2: to.x, y2: to.y })
      })
    })
  })

  svg.innerHTML = lines
    .map((l) => `<line x1="${l.x}" y1="${l.y}" x2="${l.x2}" y2="${l.y2}" class="connector-line" />`)
    .join('')
}

window.addEventListener('resize', drawT12Connectors)

// Table case-cible -> [case-source1, case-source2], deduite de T12_LINKS,
// pour savoir quelles cases sont cliquables et quelles equipes s'affrontent
// (meme principe que BOX_SOURCES pour le tableau 16 equipes).
const T12_BOX_SOURCES = {}
for (const link of T12_LINKS) {
  for (const pair of link.pairs) {
    T12_BOX_SOURCES[`${link.to}-${pair.to}`] = pair.from.map((idx) => `${link.from}-${idx}`)
  }
}

document.querySelectorAll('.t12-box').forEach((box) => {
  if (T12_BOX_SOURCES[box.dataset.t12Box]) box.classList.add('pickable')
})

document.querySelector('.t12-columns').addEventListener('click', (e) => {
  const box = e.target.closest('.t12-box')
  if (!box) return

  const sources = T12_BOX_SOURCES[box.dataset.t12Box]
  if (!sources) return

  const sourceEls = sources.map((id) => document.querySelector(`[data-t12-box="${id}"]`)).filter(Boolean)
  if (sourceEls.length < 2 || sourceEls.some((el) => !el.textContent.trim())) return

  showWinnerPicker(box, sourceEls)
})

// Remplissage manuel des cases exemptees (2eme colonne, positions impaires) :
// choix parmi les 4 equipes les mieux classees (TS1 a TS4), alternative
// manuelle au bouton "Tirage 2nd tour" (meme principe que showTsPicker pour
// le tableau 16 equipes).
document.querySelectorAll('.t12-right .t12-box').forEach((box, i) => {
  if (![0, 2, 4, 6].includes(i)) return
  box.classList.add('pickable')
  box.addEventListener('click', () => showTsPicker(box, [1, 2, 3, 4]))
})

// Un seul tournoi de flechettes a la fois : le bouton cree le tournoi au
// premier clic puis y ramene simplement ensuite (pas de liste a gerer).
function renderDartsMenu() {
  dartsLaunchBtn.textContent = dartsTournaments.length > 0 ? 'Reprendre le tournoi' : 'Lancer le tournoi'
}

dartsLaunchBtn.addEventListener('click', () => {
  const existing = dartsTournaments[0]
  if (existing) {
    navigateTo(dartsUrl(existing.id))
    return
  }
  const id = createDartsTournament('Tournoi de fléchettes')
  saveState()
  navigateTo(dartsUrl(id))
})

document.getElementById('darts-home-btn').addEventListener('click', () => navigateTo('/accueil'))
document.getElementById('tournament12-home-btn').addEventListener('click', () => navigateTo('/accueil'))
document.getElementById('tournament9-home-btn').addEventListener('click', () => navigateTo('/accueil'))

const t12ToggleBtn = document.getElementById('t12-toggle-panel')
t12ToggleBtn.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('panel-collapsed')
  t12ToggleBtn.textContent = collapsed ? '›' : '‹'
})

document.getElementById('t12-add-team-btn').addEventListener('click', () => {
  modalBackdrop.classList.remove('hidden')
})

document.getElementById('t12-fill-random-btn').addEventListener('click', () => {
  const active = getActiveTournament()
  const missing = 12 - active.teams.length
  if (missing <= 0) return

  active.teams.push(...generateFakeTeams(missing))
  renderTeams()
})

const t9ToggleBtn = document.getElementById('t9-toggle-panel')
t9ToggleBtn.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('panel-collapsed')
  t9ToggleBtn.textContent = collapsed ? '›' : '‹'
})

document.getElementById('t9-add-team-btn').addEventListener('click', () => {
  modalBackdrop.classList.remove('hidden')
})

document.getElementById('t9-fill-random-btn').addEventListener('click', () => {
  const active = getActiveTournament()
  const missing = 9 - active.teams.length
  if (missing <= 0) return

  active.teams.push(...generateFakeTeams(missing))
  renderTeams()
})

const T9_POULES = [
  { prefix: 'poule1', boxes: ['poule1-1', 'poule1-2', 'poule1-3'] },
  { prefix: 'poule2', boxes: ['poule2-1', 'poule2-2', 'poule2-3'] },
  { prefix: 'poule3', boxes: ['poule3-1', 'poule3-2', 'poule3-3'] },
]

// Phase 2 : les 1ers de chaque poule s'affrontent (Poule 1er), pareil pour
// les 2emes et les 3emes. Memes cases que celles remplies par renderT9Rankings.
const T9_PHASE2_POULES = [
  { prefix: 'p1er', boxes: ['p1er-1', 'p1er-2', 'p1er-3'] },
  { prefix: 'p2eme', boxes: ['p2eme-1', 'p2eme-2', 'p2eme-3'] },
  { prefix: 'p3eme', boxes: ['p3eme-1', 'p3eme-2', 'p3eme-3'] },
]

function t9PoolComplete(prefix) {
  const scores = getActiveTournament().t9Scores || {}
  return ['m1', 'm2', 'm3'].every((m) => scores[`${prefix}-${m}`])
}

function t9PoolStarted(prefix) {
  const scores = getActiveTournament().t9Scores || {}
  return ['m1', 'm2', 'm3'].some((m) => scores[`${prefix}-${m}`])
}

// Round-robin pour une poule de 3 : chaque equipe affronte les 2 autres une
// fois (A-B, A-C, B-C), un match par terrain et par tour.
function poolRoundRobin(names) {
  return [
    [names[0], names[1]],
    [names[0], names[2]],
    [names[1], names[2]],
  ]
}

function renderT9Schedule() {
  const scores = getActiveTournament().t9Scores || {}

  // Phase 1 (poules 1/2/3) terminee -> on bascule l'affichage sur la phase 2
  // (poules "1er/2eme/3eme"), dont les cases viennent d'etre remplies par
  // renderT9Rankings.
  const phase1Complete = T9_POULES.every(({ prefix }) => t9PoolComplete(prefix))
  const groups = phase1Complete ? T9_PHASE2_POULES : T9_POULES

  const titleEl = document.getElementById('t9-schedule-title')
  if (titleEl) titleEl.textContent = phase1Complete ? 'Ordre des matchs — Phase 2' : 'Ordre des matchs'

  const groupsMatches = groups.map(({ prefix, boxes }) => {
    const names = boxes.map((name) => boxTextTarget(document.querySelector(`[data-t9-box="${name}"]`)).textContent.trim())
    return { prefix, matches: poolRoundRobin(names) }
  })

  for (let round = 0; round < 3; round++) {
    const list = document.getElementById(`t9-round-${round + 1}`)
    list.innerHTML = ''

    groupsMatches.forEach(({ prefix, matches }, p) => {
      const pair = matches[round]
      const matchKey = `${prefix}-m${round + 1}`
      const score = scores[matchKey]

      const li = document.createElement('li')
      const courtLabel = document.createElement('span')
      courtLabel.className = 't9-match-round'
      courtLabel.textContent = `Terrain ${p + 1}`
      li.appendChild(courtLabel)

      const teamA = pair[0] || '?'
      const teamB = pair[1] || '?'
      const scoreText = score ? ` (${score.a} - ${score.b})` : ''
      li.appendChild(document.createTextNode(`${teamA} vs ${teamB}${scoreText}`))
      if (score) li.classList.add('t9-match-done')

      li.addEventListener('click', () => openT9ScoreModal(matchKey, teamA, teamB))
      list.appendChild(li)
    })
  }
}

// Classement en direct d'une poule de 3 a partir des scores saisis : victoires
// puis difference de points puis points marques en cas d'egalite.
function computeT9PoolRanking(prefix, names) {
  const scores = getActiveTournament().t9Scores || {}

  const stats = [0, 1, 2].map((i) => ({ idx: i, name: names[i], wins: 0, diff: 0, scored: 0 }))
  const matchDefs = [
    [0, 1, `${prefix}-m1`],
    [0, 2, `${prefix}-m2`],
    [1, 2, `${prefix}-m3`],
  ]

  matchDefs.forEach(([ai, bi, key]) => {
    const s = scores[key]
    if (!s) return
    stats[ai].scored += s.a
    stats[bi].scored += s.b
    stats[ai].diff += s.a - s.b
    stats[bi].diff += s.b - s.a
    if (s.a > s.b) stats[ai].wins++
    else if (s.b > s.a) stats[bi].wins++
  })

  stats.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.scored - a.scored)
  return stats
}

// Affiche la difference de points a cote de chaque equipe : c'est ce critere
// qui depage les egalites de victoires pour determiner le classement final.
function renderT9PointDiffs() {
  ;[...T9_POULES, ...T9_PHASE2_POULES].forEach(({ prefix, boxes }) => {
    const started = t9PoolStarted(prefix)
    const names = boxes.map((name) => boxTextTarget(document.querySelector(`[data-t9-box="${name}"]`)).textContent.trim())
    const ranking = started ? computeT9PoolRanking(prefix, names) : []

    boxes.forEach((boxName, slot) => {
      const box = document.querySelector(`[data-t9-box="${boxName}"]`)
      if (!box) return
      const diffEl = box.querySelector('.t9-box-diff')
      if (!diffEl) return

      const stat = ranking.find((s) => s.idx === slot)
      diffEl.textContent = stat ? (stat.diff > 0 ? `+${stat.diff}` : `${stat.diff}`) : ''
    })
  })
}

function renderT9Rankings() {
  T9_POULES.forEach(({ prefix, boxes }, p) => {
    const poolIndex = p + 1
    const rankBoxNames = [`p1er-${poolIndex}`, `p2eme-${poolIndex}`, `p3eme-${poolIndex}`]

    // Le classement final ne s'affiche qu'une fois les 3 matchs de la poule
    // joues (sinon un ordre partiel donnerait une fausse impression de resultat).
    if (!t9PoolComplete(prefix)) {
      rankBoxNames.forEach((name) => {
        const box = document.querySelector(`[data-t9-box="${name}"]`)
        if (box) boxTextTarget(box).textContent = ''
      })
      return
    }

    const names = boxes.map((name) => boxTextTarget(document.querySelector(`[data-t9-box="${name}"]`)).textContent.trim())
    const ranking = computeT9PoolRanking(prefix, names)

    ranking.forEach((s, rank) => {
      const box = document.querySelector(`[data-t9-box="${rankBoxNames[rank]}"]`)
      if (box) boxTextTarget(box).textContent = s.name
    })
  })
}

// Pour chaque emplacement (0/1/2) d'une poule, les 2 matchs qu'il joue, dans
// l'ordre d'affichage des 2 indicateurs de la case.
const T9_SLOT_MATCHES = {
  0: ['m1', 'm2'],
  1: ['m1', 'm3'],
  2: ['m2', 'm3'],
}
const T9_MATCH_SLOTS = { m1: [0, 1], m2: [0, 2], m3: [1, 2] }

function renderT9Indicators() {
  const scores = getActiveTournament().t9Scores || {}

  ;[...T9_POULES, ...T9_PHASE2_POULES].forEach(({ prefix, boxes }) => {
    boxes.forEach((boxName, slot) => {
      const box = document.querySelector(`[data-t9-box="${boxName}"]`)
      if (!box) return
      const indicators = box.querySelectorAll('.t9-indicator')

      T9_SLOT_MATCHES[slot].forEach((m, i) => {
        const indicator = indicators[i]
        if (!indicator) return
        indicator.classList.remove('t9-indicator-win', 't9-indicator-loss')

        const score = scores[`${prefix}-${m}`]
        if (!score) return

        const isA = T9_MATCH_SLOTS[m][0] === slot
        const mine = isA ? score.a : score.b
        const other = isA ? score.b : score.a
        if (mine > other) indicator.classList.add('t9-indicator-win')
        else if (mine < other) indicator.classList.add('t9-indicator-loss')
      })
    })
  })
}

const t9ScoreModalBackdrop = document.getElementById('t9-score-modal-backdrop')
const t9ScoreTeamALabel = document.getElementById('t9-score-team-a-label')
const t9ScoreTeamBLabel = document.getElementById('t9-score-team-b-label')
const t9ScoreAInput = document.getElementById('t9-score-a')
const t9ScoreBInput = document.getElementById('t9-score-b')
let editingT9MatchKey = null

function openT9ScoreModal(matchKey, teamA, teamB) {
  editingT9MatchKey = matchKey
  t9ScoreTeamALabel.textContent = teamA
  t9ScoreTeamBLabel.textContent = teamB

  const existing = (getActiveTournament().t9Scores || {})[matchKey]
  t9ScoreAInput.value = existing ? existing.a : ''
  t9ScoreBInput.value = existing ? existing.b : ''
  t9ScoreModalBackdrop.classList.remove('hidden')
}

document.getElementById('t9-score-cancel-btn').addEventListener('click', () => {
  t9ScoreModalBackdrop.classList.add('hidden')
})

document.getElementById('t9-score-validate-btn').addEventListener('click', () => {
  if (!editingT9MatchKey) return
  const a = parseInt(t9ScoreAInput.value, 10)
  const b = parseInt(t9ScoreBInput.value, 10)
  if (isNaN(a) || isNaN(b)) return

  const active = getActiveTournament()
  if (!active.t9Scores) active.t9Scores = {}
  active.t9Scores[editingT9MatchKey] = { a, b }

  t9ScoreModalBackdrop.classList.add('hidden')
  saveState()
  renderT9Rankings()
  renderT9Schedule()
  renderT9Indicators()
  renderT9PointDiffs()
})

document.getElementById('t9-draw-btn').addEventListener('click', () => {
  const active = getActiveTournament()
  const draw = shuffleArray(active.teams)

  // Un nouveau tirage change les equipes de chaque poule : les scores saisis
  // precedemment ne correspondent plus aux memes affiches, on les efface.
  active.t9Scores = {}

  T9_POULES.forEach(({ boxes }, p) => {
    const els = boxes.map((name) => document.querySelector(`[data-t9-box="${name}"]`)).filter(Boolean)
    const teams = draw.slice(p * 3, p * 3 + 3)
    animateFillBoxes(els, teams)
  })

  // Les cases de phase 2 seront effacees par renderT9Rankings() ci-dessous
  // (poules incompletes juste apres un nouveau tirage).

  setTimeout(() => {
    renderT9Rankings()
    renderT9Schedule()
    renderT9Indicators()
    renderT9PointDiffs()
  }, 3 * 150 + 250)
})

document.getElementById('t9-reset-draw-btn').addEventListener('click', () => {
  if (!confirm('Réinitialiser le tirage ? Les cases du tableau seront vidées (les équipes restent).')) return

  const active = getActiveTournament()
  active.t9Scores = {}
  restoreT9Boxes({})
  renderT9Rankings()
  renderT9Schedule()
  renderT9Indicators()
  renderT9PointDiffs()
  saveState()
})

function t12FillBoxes(names, teams) {
  const boxes = names.map((name) => document.querySelector(`[data-t12-box="${name}"]`)).filter(Boolean)
  animateFillBoxes(boxes, teams)
}

document.getElementById('t12-draw-round1-btn').addEventListener('click', () => {
  const ranked = getRankedTeams()
  const pool = ranked.filter((_, i) => i + 1 > 4)
  const draw = shuffleArray(pool).slice(0, 8)
  t12FillBoxes(['left-1', 'left-2', 'left-3', 'left-4', 'left-5', 'left-6', 'left-7', 'left-8'], draw)
})

document.getElementById('t12-draw-round2-btn').addEventListener('click', () => {
  const ranked = getRankedTeams()
  const pool = ranked.filter((_, i) => i + 1 <= 4)
  const draw = shuffleArray(pool).slice(0, 4)
  t12FillBoxes(['right-1', 'right-3', 'right-5', 'right-7'], draw)
})

document.getElementById('t12-reset-draw-btn').addEventListener('click', () => {
  if (!confirm('Réinitialiser le tirage ? Les cases du tableau seront vidées (les équipes restent).')) return

  restoreT12Boxes({})
  saveState()
})

const dartsRound1b = document.getElementById('darts-round-1b')
;['Poule A', 'Poule B', 'Poule C', 'Poule D'].forEach((label) => {
  const box = document.createElement('div')
  box.className = 'bracket-box'
  box.textContent = label
  dartsRound1b.appendChild(box)
})

const POULE_LABELS = ['A', 'B', 'C', 'D']
const dartsPlayers = [] // index = numero global - 1, { number, prenom, nom, poule, nameEl, dotEls, matchesPlayed }

function playerFullName(player) {
  return [player.prenom, player.nom].filter(Boolean).join(' ')
}

const pouleColEls = {} // poule (lettre) -> element DOM de la colonne

const dartsPouleTeams = document.getElementById('darts-poule-teams')
for (let p = 0; p < 4; p++) {
  const col = document.createElement('div')
  col.className = 'poule-col'
  pouleColEls[POULE_LABELS[p]] = col
  for (let i = 0; i < 5; i++) {
    const box = document.createElement('div')
    box.className = 'bracket-box player-box'

    const playerNumber = p * 5 + i + 1
    const savedPlayer = restoredDartsData && restoredDartsData.players && restoredDartsData.players[playerNumber - 1]
    const dotEls = []
    const player = {
      number: playerNumber,
      prenom: savedPlayer ? savedPlayer.prenom : randomItem(FAKE_PRENOMS),
      nom: savedPlayer ? savedPlayer.nom : randomItem(FAKE_NOMS),
      conso: savedPlayer ? !!savedPlayer.conso : false,
      participation: savedPlayer ? !!savedPlayer.participation : false,
      poule: POULE_LABELS[p],
      dotEls,
      matchesPlayed: 0,
      boxEl: box,
    }
    dartsPlayers.push(player)

    const number = document.createElement('span')
    number.className = 'player-number'
    number.textContent = playerNumber
    box.appendChild(number)

    const name = document.createElement('span')
    name.className = 'player-name'
    name.textContent = playerFullName(player)
    player.nameEl = name
    box.appendChild(name)

    const dots = document.createElement('span')
    dots.className = 'match-dots'
    for (let m = 0; m < 4; m++) {
      const dot = document.createElement('span')
      dot.className = 'match-dot'
      dots.appendChild(dot)
      dotEls.push(dot)
    }
    box.appendChild(dots)

    col.appendChild(box)
  }
  dartsPouleTeams.appendChild(col)
}

// Liste des joueurs (popup "Joueurs") : les 20 emplacements des poules sont
// fixes, ce popup se contente d'exposer le prenom de chaque emplacement ainsi
// que deux cases a cocher (Conso / Participation) pour le suivi cote bar.
const dartsPlayersListModalBackdrop = document.getElementById('darts-players-list-modal-backdrop')
const dartsPlayersListTbody = document.getElementById('darts-players-list-tbody')
const dartsPlayersCountEl = document.getElementById('darts-players-count')

function renderDartsPlayersList() {
  dartsPlayersListTbody.innerHTML = ''
  let filledCount = 0
  dartsPlayers.forEach((player) => {
    if (playerFullName(player).trim()) filledCount++

    const row = document.createElement('tr')

    const numTd = document.createElement('td')
    numTd.textContent = player.number
    row.appendChild(numTd)

    // Un seul champ prenom : on part du nom affiche actuellement (qui peut
    // historiquement venir du champ nom ou prenom) et on le fait converger
    // vers prenom uniquement des la premiere modification ici.
    const prenomTd = document.createElement('td')
    const prenomInput = document.createElement('input')
    prenomInput.type = 'text'
    prenomInput.value = playerFullName(player)
    prenomInput.addEventListener('change', () => {
      player.prenom = prenomInput.value.trim()
      player.nom = ''
      player.nameEl.textContent = playerFullName(player)
      dartsPlayersCountEl.textContent = dartsPlayers.filter((p) => playerFullName(p).trim()).length
      renderDartsSchedule()
      renderCiblePanels()
      saveState()
    })
    prenomTd.appendChild(prenomInput)
    row.appendChild(prenomTd)

    const consoTd = document.createElement('td')
    const consoInput = document.createElement('input')
    consoInput.type = 'checkbox'
    consoInput.checked = !!player.conso
    consoInput.addEventListener('change', () => {
      player.conso = consoInput.checked
      saveState()
    })
    consoTd.appendChild(consoInput)
    row.appendChild(consoTd)

    const participationTd = document.createElement('td')
    const participationInput = document.createElement('input')
    participationInput.type = 'checkbox'
    participationInput.checked = !!player.participation
    participationInput.addEventListener('change', () => {
      player.participation = participationInput.checked
      saveState()
    })
    participationTd.appendChild(participationInput)
    row.appendChild(participationTd)

    dartsPlayersListTbody.appendChild(row)
  })
  dartsPlayersCountEl.textContent = filledCount
}

document.getElementById('darts-players-btn').addEventListener('click', () => {
  renderDartsPlayersList()
  dartsPlayersListModalBackdrop.classList.remove('hidden')
})

document.getElementById('darts-players-list-close-btn').addEventListener('click', () => {
  dartsPlayersListModalBackdrop.classList.add('hidden')
})

// Tirage aleatoire : melange les noms/prenoms entre les 20 emplacements du
// tableau de depart (poule/numero/dots/historique restent lies a l'emplacement,
// seule l'identite du joueur qui l'occupe change).
function shuffleDartsPlayers() {
  const names = dartsPlayers.map((p) => ({ prenom: p.prenom, nom: p.nom }))
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  dartsPlayers.forEach((player, i) => {
    player.prenom = names[i].prenom
    player.nom = names[i].nom
    player.nameEl.textContent = playerFullName(player)
  })
  renderDartsSchedule()
  renderCiblePanels()
  saveState()
}

document.getElementById('darts-shuffle-btn').addEventListener('click', () => {
  if (!window.confirm('Mélanger aléatoirement tous les joueurs du tableau de départ ?')) return
  shuffleDartsPlayers()
})

// Reinitialise les matchs et resultats du tableau flechettes (scores/dots,
// poules figees, phase finale). Avec clearNames, les identites des 20
// emplacements sont aussi effacees (a retaper via le popup Joueurs). Le
// calendrier des matchs est reconstruit de zero via initDartsMatches().
function resetDartsTournament(clearNames) {
  dartsPlayers.forEach((player) => {
    player.matchesPlayed = 0
    player.dotEls.forEach((dot) => dot.classList.remove('won', 'lost'))
    player.boxEl.classList.remove('gold', 'silver', 'bronze')
    if (clearNames) {
      player.prenom = ''
      player.nom = ''
      player.conso = false
      player.participation = false
      player.nameEl.textContent = ''
    }
  })

  finalizedPoules.clear()
  dartsFinale = null
  dartsFinaleEl.classList.add('hidden')
  document.getElementById('darts-finale-semis').innerHTML = ''
  document.getElementById('darts-finale-final').innerHTML = ''
  document.getElementById('darts-finale-petite').innerHTML = ''

  dartsResults = []

  initDartsMatches()
  POULE_LABELS.forEach((poule) => reorderPouleColumn(poule))
  saveState()
}

const dartsResetModalBackdrop = document.getElementById('darts-reset-modal-backdrop')

function closeDartsResetModal() {
  dartsResetModalBackdrop.classList.add('hidden')
}

document.getElementById('darts-reset-btn').addEventListener('click', () => {
  dartsResetModalBackdrop.classList.remove('hidden')
})

document.getElementById('darts-reset-cancel-btn').addEventListener('click', closeDartsResetModal)

document.getElementById('darts-reset-matches-btn').addEventListener('click', () => {
  closeDartsResetModal()
  resetDartsTournament(false)
})

document.getElementById('darts-reset-all-btn').addEventListener('click', () => {
  if (!window.confirm('Tout réinitialiser ? Les matchs ET les noms des 20 joueurs seront effacés, il faudra tous les retaper.')) return
  closeDartsResetModal()
  resetDartsTournament(true)
})

for (let c = 0; c < 2; c++) {
  const titleEl = document.getElementById(`cible-upcoming-toggle-${c + 1}`)
  const listEl = document.getElementById(`cible-schedule-${c + 1}`)
  titleEl.addEventListener('click', () => {
    titleEl.classList.toggle('collapsed')
    listEl.classList.toggle('collapsed')
  })
}

// Calendrier des matchs de poule : methode du cercle (round-robin standard)
// pour 5 joueurs -> 5 tours de 2 matchs (+ 1 exempt de tour), ce qui espace
// equitablement les matchs de chacun (jamais deux tours de suite sans repos
// bien reparti). Cible 1 est dediee aux poules A+B et cible 2 aux poules C+D ;
// sur chaque cible, les matchs des deux poules sont entrelaces un par un
// (A, B, A, B, ... / C, D, C, D, ...) en respectant l'ordre des tours propre
// a chaque poule (cf buildPouleMatches/interleave plus bas).
function roundRobinRounds(n) {
  const hasBye = n % 2 !== 0
  const slots = hasBye ? [...Array(n).keys()].map((i) => i + 1).concat([null]) : [...Array(n).keys()].map((i) => i + 1)
  const size = slots.length
  const rounds = []

  let arr = slots.slice()
  for (let r = 0; r < size - 1; r++) {
    const round = []
    for (let i = 0; i < size / 2; i++) {
      const a = arr[i]
      const b = arr[size - 1 - i]
      if (a !== null && b !== null) round.push([a, b])
    }
    rounds.push(round)
    arr = [arr[0], arr[size - 1], ...arr.slice(1, size - 1)]
  }
  return rounds
}

function buildPouleMatches(pouleIndex) {
  const localRounds = roundRobinRounds(5) // 5 joueurs -> 5 tours, decale par l'offset de la poule
  const offset = pouleIndex * 5
  const poule = POULE_LABELS[pouleIndex]
  const matches = []
  localRounds.forEach((round, r) => {
    round.forEach((pair) => {
      const numA = pair[0] + offset
      const numB = pair[1] + offset
      matches.push({ poule, round: r + 1, a: dartsPlayers[numA - 1], b: dartsPlayers[numB - 1] })
    })
  })
  return matches
}

// Assemble deux listes en alternant un element de chacune (a1, b1, a2, b2, ...).
function interleave(listA, listB) {
  const result = []
  const len = Math.max(listA.length, listB.length)
  for (let i = 0; i < len; i++) {
    if (listA[i]) result.push(listA[i])
    if (listB[i]) result.push(listB[i])
  }
  return result
}

// Cible 1 est dediee aux poules A et B (un match sur deux de chaque, en
// alternance), Cible 2 aux poules C et D, meme fonctionnement.
function queueIndexForPoule(poule) {
  return poule === 'A' || poule === 'B' ? 0 : 1
}

function buildDartsQueues() {
  return [interleave(buildPouleMatches(0), buildPouleMatches(1)), interleave(buildPouleMatches(2), buildPouleMatches(3))]
}

// Affiche, sous chaque cible, la suite de sa propre file d'attente (le match
// deja affiche sur la cible n'est pas repete puisque la liste part de
// dartsQueueIndex[c], l'element suivant non encore attribue).
function renderDartsSchedule() {
  for (let c = 0; c < 2; c++) {
    const listEl = document.getElementById(`cible-schedule-${c + 1}`)
    listEl.innerHTML = ''
    dartsQueues[c].slice(dartsQueueIndex[c]).forEach((match) => {
      const li = document.createElement('li')
      li.textContent = `${match.a.number} vs ${match.b.number}`
      listEl.appendChild(li)
    })
  }
}

// File d'attente des matchs : seuls 2 matchs sont proposes a la fois (un par
// cible), le suivant n'apparait qu'une fois le score du match en cours saisi.
// dartsQueues[0]/dartsQueueIndex[0] = cible 1 (poules A+B), [1] = cible 2 (poules C+D).
// dartsSchedule reste la liste a plat des deux (pour computeStandings, snapshot...).
let dartsQueues = [[], []]
let dartsSchedule = []
let dartsQueueIndex = [0, 0]
const cibleMatch = [null, null]

// Colonne "Resultats" : accumule au fil de l'eau les matchs termines (ordre
// chronologique reel, pas l'ordre du calendrier), cliquables pour corriger
// le vainqueur.
let dartsResults = []

function markPlayerDot(player, won) {
  const dot = player.dotEls[player.matchesPlayed]
  if (!dot) return
  dot.classList.add(won ? 'won' : 'lost')
  player.matchesPlayed++
}

function assignNextMatch(cibleIndex) {
  const queue = dartsQueues[cibleIndex]
  if (dartsQueueIndex[cibleIndex] < queue.length) {
    cibleMatch[cibleIndex] = queue[dartsQueueIndex[cibleIndex]]
    dartsQueueIndex[cibleIndex]++
  } else {
    cibleMatch[cibleIndex] = null
  }
}

function renderCiblePanels() {
  for (let c = 0; c < 2; c++) {
    const container = document.getElementById(`cible-match-${c + 1}`)
    const match = cibleMatch[c]
    container.innerHTML = ''

    if (!match) {
      const empty = document.createElement('div')
      empty.className = 'cible-match-empty'
      empty.textContent = 'Tous les matchs sont terminés'
      container.appendChild(empty)
      continue
    }

    const poule = document.createElement('div')
    poule.className = 'cible-match-poule'
    poule.textContent = match.classement ? `Match de classement — Poule ${match.poule}` : `Poule ${match.poule}`
    container.appendChild(poule)

    const players = document.createElement('div')
    players.className = 'cible-match-players'

    const finishMatch = (winner) => {
      match.done = true
      match.winner = winner
      const loser = winner === match.a ? match.b : match.a
      // Index du dot qui representera ce match chez chaque joueur, capture
      // avant incrementation pour pouvoir corriger le vainqueur plus tard
      // (cf changeMatchWinner) sans se tromper de pastille.
      match.aDotIndex = match.a.matchesPlayed
      match.bDotIndex = match.b.matchesPlayed
      markPlayerDot(winner, true)
      markPlayerDot(loser, false)
      reorderPouleColumn(match.poule)
      assignNextMatch(c)
      dartsResults.push(match)
      renderDartsSchedule()
      renderCiblePanels()
      renderResultsColumn()
      checkPouleStatus(match.poule)
      saveState()
    }

    const btnA = document.createElement('button')
    btnA.className = 'cible-match-player-btn'
    btnA.textContent = `${match.a.number}. ${playerFullName(match.a)}`
    btnA.addEventListener('click', () => finishMatch(match.a))

    const vs = document.createElement('span')
    vs.className = 'cible-match-vs'
    vs.textContent = 'vs'

    const btnB = document.createElement('button')
    btnB.className = 'cible-match-player-btn'
    btnB.textContent = `${match.b.number}. ${playerFullName(match.b)}`
    btnB.addEventListener('click', () => finishMatch(match.b))

    players.append(btnA, vs, btnB)
    container.appendChild(players)
  }
}

function initDartsMatches() {
  dartsQueues = buildDartsQueues()
  dartsSchedule = [...dartsQueues[0], ...dartsQueues[1]]
  dartsQueueIndex = [0, 0]
  assignNextMatch(0)
  assignNextMatch(1)
  renderDartsSchedule()
  renderCiblePanels()
  renderResultsColumn()
}

initDartsMatches()

function computeStandings(poule) {
  const players = dartsPlayers.filter((p) => p.poule === poule)
  const wins = {}
  players.forEach((p) => (wins[p.number] = 0))
  dartsSchedule.forEach((m) => {
    if (m.poule === poule && m.done) wins[m.winner.number]++
  })
  return players.map((p) => ({ player: p, wins: wins[p.number] })).sort((a, b) => b.wins - a.wins)
}

function findTieGroups(standings) {
  const groups = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j + 1 < standings.length && standings[j + 1].wins === standings[i].wins) j++
    if (j > i) groups.push(standings.slice(i, j + 1).map((s) => s.player))
    i = j + 1
  }
  return groups
}

function reorderPouleColumn(poule) {
  const col = pouleColEls[poule]
  computeStandings(poule).forEach(({ player }) => col.appendChild(player.boxEl))
}

function colorPoulePodium(poule) {
  const medals = ['gold', 'silver', 'bronze']
  const standings = computeStandings(poule)
  // On reinitialise avant de recolorier : une correction de vainqueur
  // (changeMatchWinner) peut rappeler cette fonction sur une poule deja
  // finalisee, et le podium peut alors changer de composition.
  standings.forEach(({ player }) => player.boxEl.classList.remove('gold', 'silver', 'bronze'))
  standings.slice(0, 3).forEach(({ player }, i) => player.boxEl.classList.add(medals[i]))
}

// Colonne "Resultats" : liste accumulee des matchs termines, cliquables pour
// corriger le vainqueur (un match n'a que 2 joueurs, cliquer bascule vers
// l'autre). Recalcule l'ordre/podium de la poule concernee et sauvegarde.
function changeMatchWinner(match) {
  const newWinner = match.winner === match.a ? match.b : match.a
  const aDot = match.a.dotEls[match.aDotIndex]
  const bDot = match.b.dotEls[match.bDotIndex]
  if (aDot) aDot.classList.remove('won', 'lost')
  if (bDot) bDot.classList.remove('won', 'lost')
  if (aDot) aDot.classList.add(match.a === newWinner ? 'won' : 'lost')
  if (bDot) bDot.classList.add(match.b === newWinner ? 'won' : 'lost')
  match.winner = newWinner

  reorderPouleColumn(match.poule)
  if (finalizedPoules.has(match.poule)) colorPoulePodium(match.poule)
  renderResultsColumn()
  saveState()
}

function renderResultsColumn() {
  const listEl = document.getElementById('darts-results-list')
  listEl.innerHTML = ''

  if (dartsResults.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'darts-results-empty'
    empty.textContent = 'Aucun match terminé pour le moment.'
    listEl.appendChild(empty)
    return
  }

  dartsResults.forEach((match) => {
    const loser = match.winner === match.a ? match.b : match.a
    const li = document.createElement('li')

    const btn = document.createElement('button')
    btn.className = 'darts-results-item'
    btn.title = 'Cliquer pour changer le vainqueur'

    const poule = document.createElement('div')
    poule.className = 'darts-results-poule'
    poule.textContent = match.classement ? `Classement — Poule ${match.poule}` : `Poule ${match.poule}`

    const line = document.createElement('div')
    const winnerSpan = document.createElement('span')
    winnerSpan.className = 'darts-results-winner'
    winnerSpan.textContent = `${match.winner.number}. ${playerFullName(match.winner)}`
    line.appendChild(winnerSpan)
    line.append(` bat ${loser.number}. ${playerFullName(loser)}`)

    btn.append(poule, line)
    btn.addEventListener('click', () => changeMatchWinner(match))
    li.appendChild(btn)
    listEl.appendChild(li)
  })
}

// Chaque poule est traitee independamment : des qu'elle n'a plus aucun match
// en attente (matchs de poule d'origine + eventuels matchs de classement deja
// generes pour elle), soit elle a encore une egalite -> on genere son (ou ses)
// match(s) de classement, soit elle est definitivement classee -> medailles
// or/argent/bronze sur les 3 premiers et on ne la re-verifie plus.
const finalizedPoules = new Set()

function checkPouleStatus(poule) {
  if (finalizedPoules.has(poule)) return
  const pouleMatches = dartsSchedule.filter((m) => m.poule === poule)
  if (pouleMatches.length === 0 || !pouleMatches.every((m) => m.done)) return

  const tieGroups = findTieGroups(computeStandings(poule))
  if (tieGroups.length > 0) {
    const newMatches = []
    for (const group of tieGroups) {
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          newMatches.push({ poule, a: group[a], b: group[b], classement: true, done: false })
        }
      }
    }
    dartsSchedule.push(...newMatches)
    dartsQueues[queueIndexForPoule(poule)].push(...newMatches)
    const c = queueIndexForPoule(poule)
    if (!cibleMatch[c]) assignNextMatch(c)
    renderDartsSchedule()
    renderCiblePanels()
    return
  }

  finalizedPoules.add(poule)
  colorPoulePodium(poule)
  checkAllPoulesFinalized()
}

// Phase finale : une fois les 4 poules figees (medailles attribuees), le
// 1er de chaque poule passe en demi-finale croisee (A contre C, B contre D),
// affichee directement sur la page fleche (pas de route separee). Vainqueurs
// -> finale, perdants -> petite finale (3eme place).
function checkAllPoulesFinalized() {
  const allDone = POULE_LABELS.every((p) => finalizedPoules.has(p))
  dartsFinaleEl.classList.toggle('hidden', !allDone)
  if (allDone && !dartsFinale) {
    dartsFinale = buildDartsFinale()
    renderDartsFinale()
  }
}

const dartsFinaleEl = document.getElementById('darts-finale')
let dartsFinale = null // { semis: [{aNumber,bNumber,winnerNumber}, ...], final: {...}, petite: {...} }

function buildDartsFinale() {
  return {
    semis: [
      { aNumber: computeStandings('A')[0].player.number, bNumber: computeStandings('C')[0].player.number, winnerNumber: null },
      { aNumber: computeStandings('B')[0].player.number, bNumber: computeStandings('D')[0].player.number, winnerNumber: null },
    ],
    final: { aNumber: null, bNumber: null, winnerNumber: null },
    petite: { aNumber: null, bNumber: null, winnerNumber: null },
  }
}

function applySemiWinner(semiIndex, winnerNumber) {
  const semi = dartsFinale.semis[semiIndex]
  semi.winnerNumber = winnerNumber
  if (dartsFinale.semis.every((s) => s.winnerNumber)) {
    const loserNumber = (s) => (s.winnerNumber === s.aNumber ? s.bNumber : s.aNumber)
    dartsFinale.final.aNumber = dartsFinale.semis[0].winnerNumber
    dartsFinale.final.bNumber = dartsFinale.semis[1].winnerNumber
    dartsFinale.petite.aNumber = loserNumber(dartsFinale.semis[0])
    dartsFinale.petite.bNumber = loserNumber(dartsFinale.semis[1])
  }
}

function pickSemiWinner(semiIndex, winnerNumber) {
  if (dartsFinale.semis[semiIndex].winnerNumber) return
  applySemiWinner(semiIndex, winnerNumber)
  renderDartsFinale()
  saveState()
}

function pickFinalWinner(winnerNumber) {
  if (dartsFinale.final.winnerNumber) return
  dartsFinale.final.winnerNumber = winnerNumber
  renderDartsFinale()
  saveState()
}

function pickPetiteWinner(winnerNumber) {
  if (dartsFinale.petite.winnerNumber) return
  dartsFinale.petite.winnerNumber = winnerNumber
  renderDartsFinale()
  saveState()
}

function appendFinaleMatch(row, match, onPick) {
  ;[match.aNumber, match.bNumber].forEach((num, i) => {
    if (i === 1) {
      const vs = document.createElement('span')
      vs.className = 'cible-match-vs'
      vs.textContent = 'vs'
      row.appendChild(vs)
    }
    const player = dartsPlayers[num - 1]
    const btn = document.createElement('button')
    btn.className = 'cible-match-player-btn'
    btn.textContent = `${player.number}. ${playerFullName(player)}`
    if (match.winnerNumber) {
      btn.disabled = true
      btn.classList.add(match.winnerNumber === num ? 'finale-winner' : 'finale-loser')
    } else {
      btn.addEventListener('click', () => onPick(num))
    }
    row.appendChild(btn)
  })
}

function renderDartsFinale() {
  if (!dartsFinale) return

  const semisRow = document.getElementById('darts-finale-semis')
  semisRow.innerHTML = ''
  dartsFinale.semis.forEach((semi, i) => {
    if (i > 0) {
      const gap = document.createElement('span')
      gap.className = 'darts-finale-gap'
      semisRow.appendChild(gap)
    }
    appendFinaleMatch(semisRow, semi, (num) => pickSemiWinner(i, num))
  })

  const finalRow = document.getElementById('darts-finale-final')
  const petiteRow = document.getElementById('darts-finale-petite')
  finalRow.innerHTML = ''
  petiteRow.innerHTML = ''

  if (dartsFinale.final.aNumber) {
    appendFinaleMatch(finalRow, dartsFinale.final, pickFinalWinner)
    appendFinaleMatch(petiteRow, dartsFinale.petite, pickPetiteWinner)
  }
}

function showTournamentView() {
  homePage.classList.add('hidden')
  dartsView.classList.add('hidden')
  tournament12View.classList.add('hidden')
  tournament9View.classList.add('hidden')
  tournamentView.classList.remove('hidden')
  // Le tableau vient peut-etre d'etre affiche apres avoir ete display:none :
  // les positions/connecteurs calcules pendant qu'il etait cache sont faux
  // (getBoundingClientRect renvoie des rects vides), il faut les refaire.
  drawConnectors()
}

function renderTournamentMenu() {
  tournamentListPage.innerHTML = ''
  tournaments.forEach((t) => {
    const li = document.createElement('li')
    li.className = 'tournament-list-item'
    if (t.id === activeTournamentId) li.classList.add('active')

    const label = document.createElement('span')
    label.className = 'tournament-list-label'

    const nameSpan = document.createElement('span')
    nameSpan.className = 'tournament-list-name'
    nameSpan.textContent = t.name
    label.appendChild(nameSpan)

    const countSpan = document.createElement('span')
    countSpan.className = 'tournament-list-count'
    countSpan.textContent = `— ${t.teams.length} équipe${t.teams.length > 1 ? 's' : ''}`
    label.appendChild(countSpan)

    li.appendChild(label)

    const renameBtn = document.createElement('button')
    renameBtn.className = 'tournament-rename-btn'
    renameBtn.title = 'Renommer ce tournoi'
    renameBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="M15 5l4 4" /></svg>'
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      startRenameTournament(t.id, nameSpan)
    })
    li.appendChild(renameBtn)

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'tournament-delete-btn'
    deleteBtn.title = 'Supprimer ce tournoi'
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>'
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteTournament(t.id)
    })
    li.appendChild(deleteBtn)

    li.addEventListener('click', () => navigateTo(tournamentUrl(t.id)))
    tournamentListPage.appendChild(li)
  })
}

function startRenameTournament(id, nameSpan) {
  const t = tournaments.find((tour) => tour.id === id)
  if (!t) return

  let cancelled = false
  const countSpan = nameSpan.nextElementSibling
  if (countSpan) countSpan.style.display = 'none'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tournament-rename-input'
  input.value = t.name
  nameSpan.replaceWith(input)
  input.focus()
  input.select()

  input.addEventListener('click', (e) => e.stopPropagation())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur()
    } else if (e.key === 'Escape') {
      cancelled = true
      input.blur()
    }
  })
  input.addEventListener('blur', () => {
    if (!cancelled) {
      const newName = input.value.trim()
      if (newName) t.name = newName
      saveState()
    }
    renderTournamentMenu()
  })
}

function deleteTournament(id) {
  const t = tournaments.find((tour) => tour.id === id)
  if (!t) return
  if (!confirm(`Supprimer le tournoi "${t.name}" ? Cette action est irréversible.`)) return

  tournaments = tournaments.filter((tour) => tour.id !== id)

  if (activeTournamentId === id) {
    activeTournamentId = tournaments.length > 0 ? tournaments[0].id : null
    if (activeTournamentId) {
      restoreBoxes(getActiveTournament().boxes)
      renderTeams()
    }
  }

  saveState()
  renderTournamentMenu()
}

function switchTournament(id) {
  if (id === activeTournamentId) {
    return
  }
  const current = getActiveTournament()
  if (current) current.boxes = snapshotBoxes()

  activeTournamentId = id
  restoreBoxes(getActiveTournament().boxes)
  renderTeams()
  drawConnectors()
}

homeBtn.addEventListener('click', () => navigateTo('/accueil'))

// A appeler avant de quitter la vue du tournoi actif (changement de tournoi,
// nouveau tournoi, retour a l'accueil...) : les cases du bracket ne concernent
// que le format 16 equipes, inutile (et incorrect) de les lire pour un autre format.
function leaveActiveTournamentView() {
  const current = getActiveTournament()
  if (!current) return
  if (current.format === DEFAULT_FORMAT) current.boxes = snapshotBoxes()
  else if (current.format === '12') current.boxes = snapshotT12Boxes()
  else if (current.format === '9') current.boxes = snapshotT9Boxes()
}

function createTournamentOfFormat(format) {
  leaveActiveTournamentView()

  const name = `Tournoi ${(formatCounters[format] || 0) + 1}`
  const id = createTournament(name, format)
  activeTournamentId = id

  if (format === DEFAULT_FORMAT) {
    restoreBoxes({})
    renderTeams()
  } else {
    saveState()
  }

  navigateTo(tournamentUrl(id))
}

const tournamentTypeModalBackdrop = document.getElementById('tournament-type-modal-backdrop')
const tournamentTypeList = document.getElementById('tournament-type-list')
const tournamentTypeCancelBtn = document.getElementById('tournament-type-cancel-btn')

function openTournamentTypeModal() {
  tournamentTypeList.innerHTML = ''
  TOURNAMENT_FORMATS.forEach((fmt) => {
    const btn = document.createElement('button')
    btn.innerHTML = `${fmt.label}<br><small>${fmt.description}</small>`
    btn.addEventListener('click', () => {
      tournamentTypeModalBackdrop.classList.add('hidden')
      createTournamentOfFormat(fmt.id)
    })
    tournamentTypeList.appendChild(btn)
  })
  tournamentTypeModalBackdrop.classList.remove('hidden')
}

tournamentTypeCancelBtn.addEventListener('click', () => {
  tournamentTypeModalBackdrop.classList.add('hidden')
})

document.getElementById('new-tournament-page-btn').addEventListener('click', () => {
  openTournamentTypeModal()
})

window.addEventListener('popstate', renderRoute)

function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Nom/club/classement sont facultatifs : le prenom seul doit suffire a
// identifier une equipe si c'est tout ce qui a ete saisi.
function fullName(player) {
  return [player.prenom, player.nom].filter(Boolean).join(' ')
}

function shortName(player) {
  if (!player.nom) return player.prenom || ''
  const initial = player.prenom ? `${player.prenom.charAt(0)}. ` : ''
  return `${initial}${player.nom}`
}

// Certaines cases (poules du tournoi 9 equipes) isolent le nom dans un span
// dedie (des indicateurs de victoire/defaite occupent le reste de la case) :
// on cible ce span s'il existe, sinon la case elle-meme (bracket/12 equipes).
function boxTextTarget(box) {
  return box.querySelector('.t9-box-name') || box
}

function animateFillBoxes(boxes, teams) {
  boxes.forEach((box) => {
    boxTextTarget(box).textContent = ''
    box.classList.remove('pop-in')
  })

  teams.forEach((team, i) => {
    setTimeout(() => {
      const box = boxes[i]
      if (!box) return
      boxTextTarget(box).textContent = `${shortName(team.j1)} / ${shortName(team.j2)}`
      box.classList.remove('pop-in')
      void box.offsetWidth
      box.classList.add('pop-in')
      saveState()
    }, i * 150)
  })
}

function drawRound1() {
  const ranked = getRankedTeams()
  const yellowPool = ranked.filter((_, i) => i + 1 > 8)
  const draw = shuffleArray(yellowPool).slice(0, 8)

  const boxes = Array.from(document.querySelectorAll('#round-1 .bracket-box'))
  animateFillBoxes(boxes, draw)
}

function drawRound2() {
  const ranked = getRankedTeams()
  const pool = ranked.filter((_, i) => {
    const rank = i + 1
    return rank >= 5 && rank <= 8
  })
  const draw = shuffleArray(pool).slice(0, 4)

  const allBoxes = Array.from(document.querySelectorAll('#round-2 .bracket-box'))
  const boxes = [0, 2, 4, 6].map((i) => allBoxes[i])
  animateFillBoxes(boxes, draw)
}

function drawRound3() {
  const ranked = getRankedTeams()
  const [ts1, ts2, ts3, ts4] = ranked

  const [milieuHaut, milieuBas] = shuffleArray([ts3, ts4])

  const allBoxes = Array.from(document.querySelectorAll('#round-3 .bracket-box'))
  const boxes = [allBoxes[0], allBoxes[2], allBoxes[4], allBoxes[6]]
  const teams = [ts2, milieuHaut, milieuBas, ts1]

  animateFillBoxes(boxes, teams)
}

document.getElementById('draw-round1-btn').addEventListener('click', drawRound1)
document.getElementById('draw-round2-btn').addEventListener('click', drawRound2)
document.getElementById('draw-round3-btn').addEventListener('click', drawRound3)

document.getElementById('reset-draw-btn').addEventListener('click', () => {
  if (!confirm('Réinitialiser le tirage ? Les cases du tableau seront vidées (les équipes restent).')) return

  restoreBoxes({})
  fillFixedSeeds()
  drawConnectors()
  saveState()
})

// Snapshot/restauration de l'etat flechettes (voir dartsReady/restoredDartsData
// plus haut). Fait ici, tout a la fin, une fois toutes les structures
// (dartsPlayers, dartsSchedule, poules, phase finale...) en place.
function snapshotDartsState() {
  return {
    players: dartsPlayers.map((p) => ({
      prenom: p.prenom,
      nom: p.nom,
      conso: !!p.conso,
      participation: !!p.participation,
      matchesPlayed: p.matchesPlayed,
      dots: p.dotEls.map((d) => (d.classList.contains('won') ? 'won' : d.classList.contains('lost') ? 'lost' : null)),
    })),
    schedule: dartsSchedule.map((m) => ({
      poule: m.poule,
      aNumber: m.a.number,
      bNumber: m.b.number,
      classement: !!m.classement,
      done: !!m.done,
      winnerNumber: m.winner ? m.winner.number : null,
      aDotIndex: m.aDotIndex,
      bDotIndex: m.bDotIndex,
    })),
    // Ordre chronologique reel des matchs termines (colonne Resultats),
    // identifie par poule/joueurs/classement pour se remapper sur dartsSchedule
    // une fois celui-ci restaure.
    results: dartsResults.map((m) => ({ poule: m.poule, aNumber: m.a.number, bNumber: m.b.number, classement: !!m.classement })),
    finalizedPoules: [...finalizedPoules],
    finale: dartsFinale
      ? {
          semiWinners: dartsFinale.semis.map((s) => s.winnerNumber),
          finalWinner: dartsFinale.final.winnerNumber,
          petiteWinner: dartsFinale.petite.winnerNumber,
        }
      : null,
  }
}

function restoreDartsState() {
  if (!restoredDartsData) return

  // Points (victoire/defaite) et compteur de chaque joueur.
  if (restoredDartsData.players) {
    dartsPlayers.forEach((player, i) => {
      const saved = restoredDartsData.players[i]
      if (!saved) return
      player.matchesPlayed = saved.matchesPlayed || 0
      ;(saved.dots || []).forEach((state, dotIndex) => {
        if (state) player.dotEls[dotIndex].classList.add(state)
      })
    })
  }

  // Calendrier : rejoue les matchs d'origine (deterministes) puis reapplique
  // done/vainqueur ; rajoute les matchs de classement deja generes.
  if (restoredDartsData.schedule) {
    const byPlayer = (n) => dartsPlayers[n - 1]
    const findMatch = (saved) =>
      dartsSchedule.find(
        (m) => m.poule === saved.poule && m.a.number === saved.aNumber && m.b.number === saved.bNumber && !!m.classement === saved.classement
      )

    restoredDartsData.schedule.forEach((saved) => {
      let m = findMatch(saved)
      if (!m && saved.classement) {
        m = { poule: saved.poule, a: byPlayer(saved.aNumber), b: byPlayer(saved.bNumber), classement: true, done: false }
        dartsSchedule.push(m)
        dartsQueues[queueIndexForPoule(saved.poule)].push(m)
      }
      if (!m) return
      m.done = saved.done
      if (saved.winnerNumber) m.winner = byPlayer(saved.winnerNumber)
      if (saved.aDotIndex !== undefined) m.aDotIndex = saved.aDotIndex
      if (saved.bDotIndex !== undefined) m.bDotIndex = saved.bDotIndex
    })

    // Les matchs "faits" sont toujours un prefixe de chaque file (cible 1 et
    // cible 2 sont jouees dans l'ordre de leur file respective).
    dartsQueueIndex = [0, 1].map((c) => dartsQueues[c].filter((m) => m.done).length)
    assignNextMatch(0)
    assignNextMatch(1)
  }

  // Colonne Resultats : remappe l'ordre chronologique sauvegarde sur les
  // matchs (deja restaures ci-dessus) de dartsSchedule.
  if (restoredDartsData.results) {
    dartsResults = restoredDartsData.results
      .map((r) =>
        dartsSchedule.find(
          (m) => m.poule === r.poule && m.a.number === r.aNumber && m.b.number === r.bNumber && !!m.classement === r.classement
        )
      )
      .filter(Boolean)
  }

  // Poules deja classees (medailles) + tri visuel courant de chaque poule.
  if (restoredDartsData.finalizedPoules) {
    restoredDartsData.finalizedPoules.forEach((poule) => {
      finalizedPoules.add(poule)
      colorPoulePodium(poule)
    })
  }
  POULE_LABELS.forEach((poule) => reorderPouleColumn(poule))
  checkAllPoulesFinalized()

  renderDartsSchedule()
  renderCiblePanels()
  renderResultsColumn()

  // Phase finale : checkAllPoulesFinalized() vient de construire dartsFinale
  // si les 4 poules sont deja classees ; on reapplique les vainqueurs deja
  // choisis (demies, finale, petite finale).
  if (restoredDartsData.finale && dartsFinale) {
    const { semiWinners, finalWinner, petiteWinner } = restoredDartsData.finale
    ;(semiWinners || []).forEach((winnerNumber, i) => {
      if (winnerNumber) applySemiWinner(i, winnerNumber)
    })
    if (finalWinner) dartsFinale.final.winnerNumber = finalWinner
    if (petiteWinner) dartsFinale.petite.winnerNumber = petiteWinner
    renderDartsFinale()
  }
}

restoreDartsState()
dartsReady = true

renderRoute()
