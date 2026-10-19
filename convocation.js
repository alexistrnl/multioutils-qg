// Convocation : page autonome pour preparer les convocations d'un tournoi
// de n'importe quelle taille. On choisit le nombre d'equipes et le nombre
// d'heures de convocation differentes, puis on repartit les equipes sur ces
// heures (par blocs dans l'ordre, ou equipe par equipe). Les equipes peuvent
// etre saisies a la main ou importees depuis l'export FFT. Le PDF reutilise
// la mise en page de convocation-pdf.js. Tout est garde dans le localStorage.
const CONV_STORAGE_KEY = 'qg-convocation'
const CONV_MAX_TEAMS = 64
const CONV_MAX_SLOTS = 12
const CONV_DEFAULT_TEAMS = 16
const CONV_DEFAULT_SLOTS = 2

const convView = document.getElementById('conv-view')
const convNameInput = document.getElementById('conv-name')
const convTeamCountInput = document.getElementById('conv-team-count')
const convSlotCountInput = document.getElementById('conv-slot-count')
const convSlotList = document.getElementById('conv-slots')
const convTeamTbody = document.getElementById('conv-team-tbody')
const convMessage = document.getElementById('conv-message')
const convDropzone = document.getElementById('conv-dropzone')
const convFile = document.getElementById('conv-file')
const convPdfBtn = document.getElementById('conv-pdf-btn')

// conv = { name, slots: ['09:00', '10:30'], teams: [{ j1, j2, slot }] }
// avec j1/j2 = { name, club, classement } (club/classement repris de l'import).
let conv = loadConvocation()

function emptyConvPlayer() {
  return { name: '', club: '', classement: '' }
}

function emptyConvTeam(slot) {
  return { j1: emptyConvPlayer(), j2: emptyConvPlayer(), slot }
}

function defaultConvocation() {
  const c = { name: '', slots: new Array(CONV_DEFAULT_SLOTS).fill(''), teams: [] }
  for (let i = 0; i < CONV_DEFAULT_TEAMS; i++) c.teams.push(emptyConvTeam(0))
  distributeConvEvenly(c)
  return c
}

function loadConvocation() {
  try {
    const c = JSON.parse(localStorage.getItem(CONV_STORAGE_KEY))
    if (c && Array.isArray(c.slots) && c.slots.length && Array.isArray(c.teams)) return c
  } catch (e) {
    // sauvegarde illisible : on repart d'une page vierge
  }
  return defaultConvocation()
}

function saveConvocation() {
  try {
    localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(conv))
  } catch (e) {
    // stockage indisponible (navigation privee) : la page marche quand meme
  }
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10)
  if (isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// Repartit les equipes dans l'ordre, par blocs : les counts[i] premieres
// equipes sur l'heure 1, les suivantes sur l'heure 2, etc.
function assignConvBlocks(c, counts) {
  let slot = 0
  let left = counts[0]
  c.teams.forEach((team) => {
    while (left <= 0 && slot < counts.length - 1) {
      slot++
      left = counts[slot]
    }
    team.slot = slot
    left--
  })
}

// 18 equipes sur 4 heures -> 5, 5, 4, 4.
function distributeConvEvenly(c) {
  const n = c.teams.length
  const k = c.slots.length
  const counts = c.slots.map((_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0))
  assignConvBlocks(c, counts)
}

function convSlotCounts() {
  const counts = conv.slots.map(() => 0)
  conv.teams.forEach((t) => counts[t.slot]++)
  return counts
}

// Le nombre d'equipes d'une heure est modifie : les heures precedentes
// gardent leur nombre, celle-ci prend la valeur saisie et le reste est
// reparti equitablement sur les heures suivantes. La derniere heure prend
// toujours le reste, elle n'est donc pas modifiable directement.
function setConvSlotCount(index, value) {
  const n = conv.teams.length
  const counts = convSlotCounts()
  const before = counts.slice(0, index).reduce((a, b) => a + b, 0)
  counts[index] = clampInt(value, 0, n - before, counts[index])
  let rest = n - before - counts[index]
  const after = conv.slots.length - index - 1
  for (let i = index + 1; i < conv.slots.length; i++) {
    const k = i - index - 1
    counts[i] = Math.floor(rest / after) + (k < rest % after ? 1 : 0)
  }
  assignConvBlocks(conv, counts)
}

function setConvTeamCount(value) {
  const n = clampInt(value, 1, CONV_MAX_TEAMS, conv.teams.length)
  while (conv.teams.length < n) conv.teams.push(emptyConvTeam(0))
  conv.teams.length = n
  distributeConvEvenly(conv)
}

// Ajout d'une heure : on propose l'heure precedente + 1h pour aller vite.
function setConvSlotCountTotal(value) {
  const k = clampInt(value, 1, CONV_MAX_SLOTS, conv.slots.length)
  while (conv.slots.length < k) conv.slots.push(nextConvTime(conv.slots[conv.slots.length - 1]))
  conv.slots.length = k
  distributeConvEvenly(conv)
}

function nextConvTime(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(t || '')
  if (!m) return ''
  const h = parseInt(m[1], 10) + 1
  return h > 23 ? '' : `${String(h).padStart(2, '0')}:${m[2]}`
}

function convSlotLabel(i) {
  const t = conv.slots[i]
  return t ? ConvocationPdf.formatTime(t) : `Heure ${i + 1}`
}

function renderConvSlots() {
  const counts = convSlotCounts()
  convSlotList.innerHTML = ''
  conv.slots.forEach((time, i) => {
    const li = document.createElement('li')

    const label = document.createElement('span')
    label.className = 'conv-slot-label'
    label.textContent = `Heure ${i + 1}`

    const timeInput = document.createElement('input')
    timeInput.type = 'time'
    timeInput.value = time
    timeInput.addEventListener('change', () => {
      conv.slots[i] = timeInput.value
      saveConvocation()
      renderConvTeams()
    })

    const count = document.createElement('input')
    count.type = 'number'
    count.min = '0'
    count.value = counts[i]
    count.title = "Nombre d'équipes convoquées à cette heure"
    const isLast = i === conv.slots.length - 1
    if (isLast) {
      count.readOnly = true
      count.title = 'Équipes restantes'
    } else {
      count.addEventListener('change', () => {
        setConvSlotCount(i, count.value)
        saveConvocation()
        renderConvocation()
      })
    }

    const unit = document.createElement('span')
    unit.className = 'conv-slot-unit'
    unit.textContent = 'équipes'

    li.append(label, timeInput, count, unit)
    convSlotList.appendChild(li)
  })
}

function convPlayerInput(team, key, placeholder) {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = team[key].name
  input.placeholder = placeholder
  input.autocomplete = 'off'
  input.addEventListener('input', () => {
    team[key].name = input.value
    saveConvocation()
  })
  return input
}

function renderConvTeams() {
  convTeamTbody.innerHTML = ''
  conv.teams.forEach((team, i) => {
    const tr = document.createElement('tr')
    tr.className = `conv-slot-${team.slot % 6}`

    const rank = document.createElement('td')
    rank.className = 'conv-rank'
    rank.textContent = i + 1

    const p1 = document.createElement('td')
    p1.appendChild(convPlayerInput(team, 'j1', 'Prénom Nom'))
    const p2 = document.createElement('td')
    p2.appendChild(convPlayerInput(team, 'j2', 'Prénom Nom'))

    const slotCell = document.createElement('td')
    const select = document.createElement('select')
    conv.slots.forEach((_, s) => {
      const opt = document.createElement('option')
      opt.value = s
      opt.textContent = convSlotLabel(s)
      select.appendChild(opt)
    })
    select.value = team.slot
    select.addEventListener('change', () => {
      team.slot = parseInt(select.value, 10)
      saveConvocation()
      renderConvocation()
    })
    slotCell.appendChild(select)

    tr.append(rank, p1, p2, slotCell)
    convTeamTbody.appendChild(tr)
  })
}

function renderConvocation() {
  convNameInput.value = conv.name
  convTeamCountInput.value = conv.teams.length
  convSlotCountInput.value = conv.slots.length
  renderConvSlots()
  renderConvTeams()
}

function showConvMessage(text, isError) {
  convMessage.textContent = text
  convMessage.classList.toggle('hidden', !text)
  convMessage.classList.toggle('error', !!isError)
}

function showConvocationView() {
  homePage.classList.add('hidden')
  tournamentView.classList.add('hidden')
  dartsView.classList.add('hidden')
  tournament12View.classList.add('hidden')
  tournament9View.classList.add('hidden')
  tournament8View.classList.add('hidden')
  inventoryView.classList.add('hidden')
  planningView.classList.add('hidden')
  convView.classList.remove('hidden')
  showConvMessage('')
  renderConvocation()
}

convNameInput.addEventListener('input', () => {
  conv.name = convNameInput.value
  saveConvocation()
})

convTeamCountInput.addEventListener('change', () => {
  setConvTeamCount(convTeamCountInput.value)
  saveConvocation()
  renderConvocation()
})

convSlotCountInput.addEventListener('change', () => {
  setConvSlotCountTotal(convSlotCountInput.value)
  saveConvocation()
  renderConvocation()
})

document.getElementById('conv-distribute-btn').addEventListener('click', () => {
  distributeConvEvenly(conv)
  saveConvocation()
  renderConvocation()
})

document.getElementById('conv-reset-btn').addEventListener('click', () => {
  if (!confirm('Effacer le nom, les heures et toutes les équipes ?')) return
  conv = defaultConvocation()
  saveConvocation()
  showConvMessage('')
  renderConvocation()
})

// Import FFT : le nombre d'equipes suit le fichier, ordre officiel conserve.
function convPlayerFromFft(p) {
  return { name: [p.prenom, p.nom].filter(Boolean).join(' '), club: p.club || '', classement: p.classement || '' }
}

async function importConvocationFile(file) {
  if (!file || convDropzone.classList.contains('busy')) return
  if (!/\.xlsx?$/i.test(file.name)) {
    showConvMessage(`« ${file.name} » n'est pas un fichier Excel (.xlsx).`, true)
    return
  }
  convDropzone.classList.add('busy')
  try {
    const [XLSX, buffer] = await Promise.all([loadXlsxLib(), file.arrayBuffer()])
    let workbook
    try {
      workbook = XLSX.read(buffer, { type: 'array' })
    } catch (e) {
      showConvMessage(`« ${file.name} » n'est pas un fichier Excel valide.`, true)
      return
    }
    const result = FftImport.parseFftWorkbook(XLSX, workbook, null, { anyCount: true })
    if (!result.ok) {
      showConvMessage(result.errors.join(' '), true)
      return
    }
    const teams = result.teams.slice(0, CONV_MAX_TEAMS)
    conv.teams = teams.map((t) => ({ j1: convPlayerFromFft(t.j1), j2: convPlayerFromFft(t.j2), slot: 0 }))
    distributeConvEvenly(conv)
    saveConvocation()
    renderConvocation()
    const notes = [`${teams.length} équipe${teams.length > 1 ? 's' : ''} importée${teams.length > 1 ? 's' : ''}.`, ...result.warnings]
    if (result.teams.length > CONV_MAX_TEAMS) notes.push(`Limité aux ${CONV_MAX_TEAMS} premières paires.`)
    showConvMessage(notes.join(' '), false)
  } catch (e) {
    showConvMessage("Impossible de charger le lecteur Excel (vérifiez la connexion lors du premier import).", true)
  } finally {
    convDropzone.classList.remove('busy')
    convFile.value = ''
  }
}

convDropzone.addEventListener('click', () => {
  convFile.value = ''
  convFile.click()
})
convDropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    convFile.click()
  }
})
convFile.addEventListener('change', () => importConvocationFile(convFile.files[0]))
;['dragenter', 'dragover'].forEach((type) => {
  convView.addEventListener(type, (e) => {
    e.preventDefault()
    convDropzone.classList.toggle('dragover', convDropzone.contains(e.target))
  })
})
convView.addEventListener('dragleave', (e) => {
  if (!convView.contains(e.relatedTarget)) convDropzone.classList.remove('dragover')
})
convView.addEventListener('drop', (e) => {
  e.preventDefault()
  convDropzone.classList.remove('dragover')
  if (convDropzone.contains(e.target)) importConvocationFile(e.dataTransfer.files[0])
})

// Titre de section : "Paires 1 à 6" si les equipes de l'heure se suivent,
// sinon simplement leur nombre.
function convSectionTitle(ranks) {
  const contiguous = ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)
  if (ranks.length === 1) return `Paire ${ranks[0]}`
  if (contiguous) return `Paires ${ranks[0]} à ${ranks[ranks.length - 1]}`
  return `${ranks.length} paires`
}

function convPoints(team) {
  const a = parseFloat(team.j1.classement)
  const b = parseFloat(team.j2.classement)
  if (isNaN(a) || isNaN(b)) return 'NC'
  return String(Math.round((a + b) * 100) / 100)
}

function convPdfPlayer(p) {
  return { name: p.name.trim() || '—', classement: (p.classement || '').trim(), club: (p.club || '').trim() }
}

convPdfBtn.addEventListener('click', async () => {
  const name = conv.name.trim()
  if (!name) {
    showConvMessage('Le nom du tournoi est obligatoire.', true)
    convNameInput.focus()
    return
  }
  const counts = convSlotCounts()
  const missing = conv.slots.findIndex((t, i) => counts[i] > 0 && !t)
  if (missing !== -1) {
    showConvMessage(`Saisissez l'heure ${missing + 1} (${counts[missing]} équipe${counts[missing] > 1 ? 's' : ''} convoquée${counts[missing] > 1 ? 's' : ''}).`, true)
    convSlotList.querySelectorAll('input[type="time"]')[missing].focus()
    return
  }
  showConvMessage('')

  const sections = conv.slots
    .map((time, s) => {
      const ranks = []
      const rows = []
      conv.teams.forEach((team, i) => {
        if (team.slot !== s) return
        ranks.push(i + 1)
        rows.push({ rank: String(i + 1), points: convPoints(team), players: [convPdfPlayer(team.j1), convPdfPlayer(team.j2)] })
      })
      return { title: ranks.length ? convSectionTitle(ranks) : '', time, accent: s === 0, rows }
    })
    .sort((a, b) => a.time.localeCompare(b.time))

  convPdfBtn.disabled = true
  try {
    await loadScript('/vendor/jspdf.umd.min.js')
    await loadScript('/vendor/jspdf.plugin.autotable.min.js')
    const logo = await loadLogoForPdf()
    const doc = ConvocationPdf.buildConvocationPdf(window.jspdf.jsPDF, {
      subtitle: `${name} — Le QG Padel Club`,
      footer: `Le QG Padel Club — ${name}`,
      date: new Date(),
      logo,
      sections,
    })
    const slug = acNormalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    doc.save(`convocations-${slug || 'tournoi'}.pdf`)
  } catch (e) {
    showConvMessage('Impossible de générer le PDF (vérifiez la connexion lors de la première génération).', true)
  } finally {
    convPdfBtn.disabled = false
  }
})
