// Suivi partenariat : un cadre par partenaire avec son budget en euros.
// On saisit le budget accorde, puis on ajoute les depenses au fil de l'eau ;
// la barre montre la part deja depensee. Tout est garde dans le localStorage.
const PART_STORAGE_KEY = 'qg-partenariats'
const PART_MAX_AMOUNT = 10000000

const partView = document.getElementById('part-view')
const partNameInput = document.getElementById('part-name')
const partTotalInput = document.getElementById('part-total')
const partList = document.getElementById('part-list')
const partMessage = document.getElementById('part-message')

const partEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const partDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

// partners = [{ id, name, total, expenses: [{ id, amount, label, date }] }]
let partners = loadPartners()

function loadPartners() {
  try {
    const p = JSON.parse(localStorage.getItem(PART_STORAGE_KEY))
    if (Array.isArray(p)) return p.map(migratePartner)
  } catch (e) {
    // sauvegarde illisible : on repart d'une liste vide
  }
  return []
}

// Ancienne version : un simple compteur "used" au lieu de la liste des
// depenses. On le garde comme une premiere depense.
function migratePartner(p) {
  if (Array.isArray(p.expenses)) return p
  const expenses = p.used > 0 ? [{ id: Date.now(), amount: p.used, label: 'Solde initial', date: Date.now() }] : []
  return { id: p.id, name: p.name, total: p.total || 0, expenses }
}

function savePartners() {
  try {
    localStorage.setItem(PART_STORAGE_KEY, JSON.stringify(partners))
  } catch (e) {
    // stockage indisponible (navigation privee) : la page marche quand meme
  }
}

// Montant en euros, virgule acceptee, arrondi au centime.
function partAmount(v) {
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''))
  if (isNaN(n) || n < 0) return null
  return Math.min(PART_MAX_AMOUNT, Math.round(n * 100) / 100)
}

function partSpent(p) {
  return Math.round(p.expenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100
}

function showPartMessage(text) {
  partMessage.textContent = text
  partMessage.classList.toggle('hidden', !text)
}

function partAmountInput(placeholder) {
  const input = document.createElement('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.placeholder = placeholder
  input.autocomplete = 'off'
  return input
}

function renderPartnerCard(p) {
  const card = document.createElement('li')
  card.className = 'part-card'

  const header = document.createElement('div')
  header.className = 'part-card-header'
  const name = document.createElement('h3')
  name.textContent = p.name
  const del = document.createElement('button')
  del.className = 'part-delete-btn'
  del.textContent = '×'
  del.title = 'Supprimer ce partenariat'
  del.addEventListener('click', () => {
    if (!confirm(`Supprimer le partenariat « ${p.name} » et toutes ses dépenses ?`)) return
    partners = partners.filter((x) => x !== p)
    savePartners()
    renderPartners()
  })
  header.append(name, del)

  const spent = partSpent(p)
  const left = Math.round((p.total - spent) * 100) / 100
  const bar = document.createElement('div')
  bar.className = 'part-bar'
  if (p.total > 0 && spent >= p.total) bar.classList.add('full')
  const fill = document.createElement('div')
  fill.className = 'part-bar-fill'
  fill.style.width = `${p.total > 0 ? Math.min(1, spent / p.total) * 100 : 0}%`
  bar.appendChild(fill)

  const figures = document.createElement('div')
  figures.className = 'part-figures'
  const spentEl = document.createElement('span')
  spentEl.textContent = `${partEuro.format(spent)} dépensés`
  const leftEl = document.createElement('span')
  leftEl.className = left < 0 ? 'part-over' : ''
  leftEl.textContent = left < 0 ? `${partEuro.format(-left)} de dépassement` : `${partEuro.format(left)} restants`
  figures.append(spentEl, leftEl)

  const budget = document.createElement('label')
  budget.className = 'part-budget'
  budget.textContent = 'Budget'
  const budgetInput = partAmountInput('0')
  budgetInput.value = p.total
  budgetInput.addEventListener('change', () => {
    const v = partAmount(budgetInput.value)
    if (v !== null) p.total = v
    savePartners()
    renderPartners()
  })
  budget.append(budgetInput, document.createTextNode('€'))

  const form = document.createElement('div')
  form.className = 'part-expense-form'
  const amountInput = partAmountInput('Montant €')
  const labelInput = document.createElement('input')
  labelInput.type = 'text'
  labelInput.placeholder = 'Libellé (facultatif)'
  labelInput.autocomplete = 'off'
  const addBtn = document.createElement('button')
  addBtn.className = 'planning-copy-btn'
  addBtn.textContent = 'Ajouter la dépense'
  const addExpense = () => {
    const amount = partAmount(amountInput.value)
    if (!amount) {
      amountInput.classList.add('invalid')
      amountInput.focus()
      return
    }
    p.expenses.unshift({ id: Date.now(), amount, label: labelInput.value.trim(), date: Date.now() })
    savePartners()
    renderPartners()
  }
  addBtn.addEventListener('click', addExpense)
  ;[amountInput, labelInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addExpense()
    })
  })
  amountInput.addEventListener('input', () => amountInput.classList.remove('invalid'))
  form.append(amountInput, labelInput, addBtn)

  const history = document.createElement('ul')
  history.className = 'part-expenses'
  if (!p.expenses.length) {
    const empty = document.createElement('li')
    empty.className = 'part-empty'
    empty.textContent = 'Aucune dépense.'
    history.appendChild(empty)
  }
  p.expenses.forEach((e) => {
    const li = document.createElement('li')
    const date = document.createElement('span')
    date.className = 'part-expense-date'
    date.textContent = partDate.format(new Date(e.date))
    const label = document.createElement('span')
    label.className = 'part-expense-label'
    label.textContent = e.label || '—'
    const amount = document.createElement('span')
    amount.className = 'part-expense-amount'
    amount.textContent = partEuro.format(e.amount)
    const remove = document.createElement('button')
    remove.className = 'part-expense-remove'
    remove.textContent = '×'
    remove.title = 'Supprimer cette dépense'
    remove.addEventListener('click', () => {
      if (!confirm(`Supprimer la dépense de ${partEuro.format(e.amount)} ?`)) return
      p.expenses = p.expenses.filter((x) => x !== e)
      savePartners()
      renderPartners()
    })
    li.append(date, label, amount, remove)
    history.appendChild(li)
  })

  card.append(header, bar, figures, budget, form, history)
  return card
}

function renderPartners() {
  partList.innerHTML = ''
  if (!partners.length) {
    const empty = document.createElement('li')
    empty.className = 'part-empty'
    empty.textContent = 'Aucun partenariat pour le moment.'
    partList.appendChild(empty)
    return
  }
  partners.forEach((p) => partList.appendChild(renderPartnerCard(p)))
}

function addPartner() {
  const name = partNameInput.value.trim()
  if (!name) {
    showPartMessage('Le nom du partenaire est obligatoire.')
    partNameInput.focus()
    return
  }
  partners.push({ id: Date.now(), name, total: partAmount(partTotalInput.value) || 0, expenses: [] })
  savePartners()
  partNameInput.value = ''
  partTotalInput.value = ''
  showPartMessage('')
  renderPartners()
  partNameInput.focus()
}

function showPartenariatView() {
  homePage.classList.add('hidden')
  tournamentView.classList.add('hidden')
  dartsView.classList.add('hidden')
  tournament12View.classList.add('hidden')
  tournament9View.classList.add('hidden')
  tournament8View.classList.add('hidden')
  inventoryView.classList.add('hidden')
  planningView.classList.add('hidden')
  convView.classList.add('hidden')
  partView.classList.remove('hidden')
  showPartMessage('')
  renderPartners()
}

document.getElementById('part-add-btn').addEventListener('click', addPartner)
;[partNameInput, partTotalInput].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPartner()
  })
})
