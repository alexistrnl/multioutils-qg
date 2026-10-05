// Planning terrains : grille vide terrains x creneaux de la journee. On
// clique sur les creneaux deja reserves (vus sur Gestion Sports) et le
// message WhatsApp des creneaux restants se redige tout seul. Les
// reservations cochees sont memorisees par date dans le localStorage.
const PLANNING_STORAGE_KEY = 'qg-planning'
const PLANNING_COURTS = ['Terrain 1', 'Terrain 2', 'Terrain 3', 'Terrain 4']
// Creneaux [debut, fin] en minutes depuis minuit.
const PLANNING_SLOTS_WEEK = [
  [9 * 60, 10 * 60 + 30],
  [10 * 60 + 30, 12 * 60],
  [12 * 60, 14 * 60],
  [14 * 60, 15 * 60 + 30],
  [15 * 60 + 30, 17 * 60],
  [17 * 60, 18 * 60 + 30],
  [18 * 60 + 30, 20 * 60],
  [20 * 60, 21 * 60 + 30],
  [21 * 60 + 30, 23 * 60],
]
const PLANNING_SLOTS_WEEKEND = [
  [9 * 60, 10 * 60 + 30],
  [10 * 60 + 30, 12 * 60],
  [12 * 60, 13 * 60 + 30],
  [13 * 60 + 30, 15 * 60],
  [15 * 60, 16 * 60 + 30],
  [16 * 60 + 30, 18 * 60],
  [18 * 60, 19 * 60 + 30],
]
const PLANNING_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const PLANNING_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
// Au-dela, les journees passees sont oubliees pour ne pas remplir le stockage.
const PLANNING_KEEP_DAYS = 14

let planningDate = startOfDay(new Date())
// planningBooked['2026-10-05'] = ['Terrain 1|540', ...] (terrain|debut)
let planningBooked = loadPlanning()

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isWeekend(d) {
  return d.getDay() === 0 || d.getDay() === 6
}

function slotsFor(d) {
  return isWeekend(d) ? PLANNING_SLOTS_WEEKEND : PLANNING_SLOTS_WEEK
}

// 540 -> "9h", 630 -> "10h30"
function formatTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function formatDate(d) {
  return `${PLANNING_DAYS[d.getDay()]} ${d.getDate()} ${PLANNING_MONTHS[d.getMonth()]}`
}

function loadPlanning() {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(PLANNING_STORAGE_KEY))
  } catch (e) {
    return {}
  }
  if (!saved || typeof saved !== 'object') return {}
  const limit = dateKey(new Date(Date.now() - PLANNING_KEEP_DAYS * 86400000))
  const data = {}
  Object.keys(saved).forEach((k) => {
    if (k >= limit && Array.isArray(saved[k])) data[k] = saved[k].map(String)
  })
  return data
}

function savePlanning() {
  try {
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(planningBooked))
  } catch (e) {
    // stockage indisponible : on continue sans persistance
  }
}

function bookedSet() {
  return new Set(planningBooked[dateKey(planningDate)] || [])
}

function toggleBooking(court, start) {
  const key = dateKey(planningDate)
  const set = bookedSet()
  const id = `${court}|${start}`
  if (set.has(id)) set.delete(id)
  else set.add(id)
  if (set.size) planningBooked[key] = [...set]
  else delete planningBooked[key]
  savePlanning()
  renderPlanning()
}

function isToday(d) {
  return dateKey(d) === dateKey(new Date())
}

// Un creneau est passe des que son heure de debut est depassee (jour
// precedent : tous passes ; jour suivant : aucun).
function isSlotPast(start) {
  const now = new Date()
  const day = dateKey(planningDate)
  const today = dateKey(now)
  if (day < today) return true
  if (day > today) return false
  return start < now.getHours() * 60 + now.getMinutes()
}

function upcomingSlots() {
  return slotsFor(planningDate).filter(([start]) => !isSlotPast(start))
}

function buildPlanningMessage() {
  const set = bookedSet()
  const slots = upcomingSlots()
  const today = isToday(planningDate)
  const lines = []
  PLANNING_COURTS.forEach((court) => {
    const free = slots.filter(([start]) => !set.has(`${court}|${start}`)).map(([start]) => formatTime(start))
    if (free.length) lines.push(`🔥${courtLabel(court)} : ${free.join(' / ')}`)
  })
  const intro = today ? '🚨 Voici les dispos du jour au QG 🚨' : `🚨 Voici les dispos du ${formatDate(planningDate)} au QG 🚨`
  let body = lines.join('\n\n')
  if (!slots.length) body = today ? "Plus aucun créneau pour aujourd'hui, à demain 🙌" : 'Plus aucun créneau ce jour-là.'
  else if (!lines.length) body = `Tout est complet ${today ? "aujourd'hui" : 'ce jour-là'} 🙌`
  return [
    'Ola 👋',
    '',
    intro,
    '',
    body,
    '',
    "📱 Résa sur l'appli ou par téléphone au 0616723113",
    'Belle journée à toutes et à tous.',
    'Le QG Padel',
  ].join('\n')
}

// "Terrain 2" -> "Pista 2" (nom utilise par le club dans ses messages)
function courtLabel(court) {
  return court.replace('Terrain', 'Pista')
}

function renderPlanning() {
  document.getElementById('planning-date').textContent = formatDate(planningDate)
  document.getElementById('planning-today-btn').classList.toggle('hidden', isToday(planningDate))

  const set = bookedSet()
  const slots = slotsFor(planningDate)
  const grid = document.getElementById('planning-grid')
  grid.innerHTML = ''
  grid.style.gridTemplateRows = `auto repeat(${slots.length}, 1fr)`

  grid.appendChild(document.createElement('div'))
  PLANNING_COURTS.forEach((c) => {
    const head = document.createElement('div')
    head.className = 'planning-court'
    head.textContent = courtLabel(c)
    grid.appendChild(head)
  })

  slots.forEach(([start, end]) => {
    const time = document.createElement('div')
    time.className = 'planning-time'
    time.textContent = `${formatTime(start)} – ${formatTime(end)}`
    grid.appendChild(time)
    PLANNING_COURTS.forEach((court) => {
      const btn = document.createElement('button')
      const booked = set.has(`${court}|${start}`)
      if (isSlotPast(start)) {
        // Creneau commence : grise, non cliquable, absent du message.
        btn.className = 'planning-slot past'
        btn.textContent = 'Passé'
        btn.disabled = true
      } else {
        btn.className = 'planning-slot' + (booked ? ' booked' : '')
        btn.textContent = booked ? 'Réservé' : 'Libre'
        btn.addEventListener('click', () => toggleBooking(court, start))
      }
      grid.appendChild(btn)
    })
  })

  document.getElementById('planning-message').textContent = buildPlanningMessage()
  planningShownToday = isToday(planningDate)
  planningRenderedAt = Math.floor(Date.now() / 60000)
}

// Page laissee ouverte : on re-dessine a chaque nouvelle minute pour que les
// creneaux qui commencent passent en "Passe" et sortent du message. Si on
// regardait "aujourd'hui" et que minuit passe, on suit le nouveau jour.
let planningShownToday = false
let planningRenderedAt = 0
setInterval(() => {
  const view = document.getElementById('planning-view')
  if (!view || view.classList.contains('hidden')) return
  if (Math.floor(Date.now() / 60000) === planningRenderedAt) return
  if (planningShownToday && !isToday(planningDate)) planningDate = startOfDay(new Date())
  renderPlanning()
}, 15000)

function shiftPlanningDay(delta) {
  planningDate = new Date(planningDate.getFullYear(), planningDate.getMonth(), planningDate.getDate() + delta)
  renderPlanning()
}

document.getElementById('planning-prev-btn').addEventListener('click', () => shiftPlanningDay(-1))
document.getElementById('planning-next-btn').addEventListener('click', () => shiftPlanningDay(1))
document.getElementById('planning-today-btn').addEventListener('click', () => {
  planningDate = startOfDay(new Date())
  renderPlanning()
})

document.getElementById('planning-copy-btn').addEventListener('click', (e) => {
  const btn = e.currentTarget
  const text = buildPlanningMessage()
  const done = () => {
    btn.textContent = 'Copié ✓'
    btn.classList.add('copied')
    setTimeout(() => {
      btn.textContent = 'Copier le message'
      btn.classList.remove('copied')
    }, 1500)
  }
  // Repli si l'API presse-papiers est indisponible (ancien navigateur, http).
  const fallback = () => {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      if (document.execCommand('copy')) done()
    } catch (err) {
      // copie impossible : le message reste visible pour une copie manuelle
    }
    area.remove()
  }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback)
  else fallback()
})
