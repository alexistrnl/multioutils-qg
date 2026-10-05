// Inventaire textile : un tableau par article (T-shirts, Polos). Colonnes :
// Homme puis Femme, chacun subdivise par couleur ; lignes : tailles. Les
// quantites se saisissent a la main. Independant des tournois : propre cle
// localStorage, sauvegarde a chaque saisie.
const INVENTORY_STORAGE_KEY = 'qg-inventaire'
const INVENTORY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const INVENTORY_GENDERS = ['Homme', 'Femme']
const INVENTORY_ARTICLES = [
  { id: 'tshirt', label: 'T-shirts', oldLabel: 'T-shirt' },
  { id: 'polo', label: 'Polos', oldLabel: 'Polo' },
]
const INVENTORY_DEFAULT_COLORS = ['Noir', 'Blanc']

// Stock initial communique par le club, applique une seule fois par
// appareil (identifiant memorise dans appliedSeeds). Ne remplit que les
// cases encore vides : une saisie deja faite a la main n'est pas ecrasee.
const INVENTORY_SEEDS = [
  {
    id: 'tshirt-homme-2026-10',
    article: 'tshirt',
    gender: 'Homme',
    stock: {
      'Bleu marine': { S: 6, XL: 6 },
      Rose: { S: 6, XL: 5, XXL: 3 },
      Noir: { L: 1, XL: 3, XXL: 4 },
      Blanc: { XL: 3, XXL: 4 },
      Jaune: { XL: 2 },
    },
  },
  {
    id: 'polo-homme-2026-10',
    article: 'polo',
    gender: 'Homme',
    stock: {
      Noir: { S: 7, M: 6, XL: 7, XXL: 2 },
      Blanc: { S: 9, M: 6, XL: 8, XXL: 4 },
    },
  },
]

let appliedSeeds = []

// inventory[article] = { colors: ['Noir', ...], qty: { 'Homme|Noir|M': 3, ... } }
let inventory = loadInventory()
applyInventorySeeds()

function qtyKey(gender, color, size) {
  return `${gender}|${color}|${size}`
}

function cleanQty(n) {
  n = Number(n)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function defaultInventory() {
  const data = {}
  INVENTORY_ARTICLES.forEach((a) => (data[a.id] = { colors: INVENTORY_DEFAULT_COLORS.slice(), qty: {} }))
  return data
}

function loadInventory() {
  const data = defaultInventory()
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(INVENTORY_STORAGE_KEY))
  } catch (e) {
    return data
  }
  if (!saved) return data
  if (Array.isArray(saved.appliedSeeds)) appliedSeeds = saved.appliedSeeds.map(String)

  if (saved.version === 3) {
    INVENTORY_ARTICLES.forEach((a) => {
      const s = saved[a.id]
      if (!s || !Array.isArray(s.colors)) return
      data[a.id].colors = s.colors.map(String).filter(Boolean)
      Object.keys(s.qty || {}).forEach((k) => {
        const n = cleanQty(s.qty[k])
        if (n) data[a.id].qty[k] = n
      })
    })
    return data
  }

  // Version precedente (grande liste) : on reprend couleurs et quantites.
  if (Array.isArray(saved.items)) {
    INVENTORY_ARTICLES.forEach((a) => (data[a.id].colors = []))
    saved.items.forEach((i) => {
      const a = INVENTORY_ARTICLES.find((x) => x.oldLabel === i.article)
      if (!a || !i.color) return
      const color = String(i.color)
      if (!data[a.id].colors.includes(color)) data[a.id].colors.push(color)
      const n = cleanQty(i.qty)
      if (n) data[a.id].qty[qtyKey(i.gender, color, i.size)] = n
    })
  }
  return data
}

function applyInventorySeeds() {
  let changed = false
  INVENTORY_SEEDS.forEach((seed) => {
    if (appliedSeeds.includes(seed.id)) return
    const data = inventory[seed.article]
    Object.keys(seed.stock).forEach((color) => {
      // Reutilise l'orthographe d'une couleur existante (noir / Noir).
      let name = data.colors.find((c) => c.toLowerCase() === color.toLowerCase())
      if (!name) {
        name = color
        data.colors.push(name)
      }
      Object.keys(seed.stock[color]).forEach((size) => {
        const key = qtyKey(seed.gender, name, size)
        if (!data.qty[key]) data.qty[key] = seed.stock[color][size]
      })
    })
    appliedSeeds.push(seed.id)
    changed = true
  })
  if (changed) saveInventory()
}

function saveInventory() {
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(Object.assign({ version: 3, appliedSeeds }, inventory)))
  } catch (e) {
    // stockage indisponible : on continue sans persistance
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderInventory() {
  const root = document.getElementById('inventory-content')
  root.innerHTML = ''
  INVENTORY_ARTICLES.forEach((a) => root.appendChild(renderArticleTable(a)))
}

// Articles dont le panneau de gestion des couleurs est ouvert (bouton
// stylo) ; conserve entre deux rendus.
const inventoryEditing = new Set()

const PENCIL_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>'

function renderArticleTable(article) {
  const data = inventory[article.id]
  const colors = data.colors
  const card = el('section', 'inv-card')
  const editing = inventoryEditing.has(article.id)

  const head = el('div', 'inv-card-head')
  head.appendChild(el('h2', 'inv-card-title', article.label))
  const editBtn = el('button', 'inv-edit-btn' + (editing ? ' active' : ''))
  editBtn.innerHTML = PENCIL_SVG
  editBtn.title = editing ? 'Terminer la modification' : 'Modifier les couleurs'
  editBtn.addEventListener('click', () => {
    if (editing) inventoryEditing.delete(article.id)
    else inventoryEditing.add(article.id)
    renderInventory()
    if (!editing) {
      const input = document.querySelector(`[data-color-input="${article.id}"]`)
      if (input) input.focus()
    }
  })
  head.appendChild(editBtn)
  const grand = el('span', 'inv-total-badge')
  head.appendChild(grand)
  card.appendChild(head)
  if (editing) card.appendChild(renderColorManager(article, data))

  const wrap = el('div', 'inv-table-wrap')
  const table = el('table', 'inv-table')
  const thead = el('thead')

  // Ligne 1 : Taille | Homme (n couleurs) | Femme (n couleurs)
  const r1 = el('tr')
  const sizeTh = el('th', 'inv-size-col', 'Taille')
  sizeTh.rowSpan = 2
  r1.appendChild(sizeTh)
  INVENTORY_GENDERS.forEach((g) => {
    const th = el('th', 'inv-gender-th', g)
    th.colSpan = Math.max(colors.length, 1)
    r1.appendChild(th)
  })
  thead.appendChild(r1)

  // Ligne 2 : couleurs, repetees sous Homme et sous Femme
  const r2 = el('tr')
  INVENTORY_GENDERS.forEach((g, gi) => {
    if (!colors.length) {
      r2.appendChild(el('th', 'inv-color-th' + (gi ? ' inv-sep' : ''), '—'))
      return
    }
    colors.forEach((c, ci) => r2.appendChild(el('th', 'inv-color-th' + (gi && !ci ? ' inv-sep' : ''), c)))
  })
  thead.appendChild(r2)
  table.appendChild(thead)

  const tbody = el('tbody')
  const inputs = []
  INVENTORY_SIZES.forEach((size) => {
    const tr = el('tr')
    tr.appendChild(el('th', 'inv-size-col', size))
    INVENTORY_GENDERS.forEach((g, gi) => {
      if (!colors.length) {
        tr.appendChild(el('td', gi ? 'inv-sep' : ''))
        return
      }
      colors.forEach((c, ci) => {
        const td = el('td', gi && !ci ? 'inv-sep' : '')
        const input = el('input', 'inv-cell-input')
        input.type = 'number'
        input.min = '0'
        input.inputMode = 'numeric'
        input.placeholder = '0'
        const key = qtyKey(g, c, size)
        const n = data.qty[key] || 0
        input.value = n ? n : ''
        input.addEventListener('input', () => {
          const v = cleanQty(input.value)
          if (v) data.qty[key] = v
          else delete data.qty[key]
          saveInventory()
          updateTotals()
        })
        input.addEventListener('blur', () => {
          const v = data.qty[key] || 0
          input.value = v ? v : ''
        })
        inputs.push({ input, gender: g, color: c })
        td.appendChild(input)
        tr.appendChild(td)
      })
    })
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)

  // Ligne de total par colonne
  const tfoot = el('tfoot')
  const fr = el('tr')
  fr.appendChild(el('th', 'inv-size-col', 'Total'))
  const totalCells = {}
  INVENTORY_GENDERS.forEach((g, gi) => {
    if (!colors.length) {
      fr.appendChild(el('td', gi ? 'inv-sep' : ''))
      return
    }
    colors.forEach((c, ci) => {
      const td = el('td', 'inv-col-total' + (gi && !ci ? ' inv-sep' : ''))
      totalCells[`${g}|${c}`] = td
      fr.appendChild(td)
    })
  })
  tfoot.appendChild(fr)
  table.appendChild(tfoot)

  function updateTotals() {
    let all = 0
    INVENTORY_GENDERS.forEach((g) =>
      colors.forEach((c) => {
        const sum = INVENTORY_SIZES.reduce((s, size) => s + (data.qty[qtyKey(g, c, size)] || 0), 0)
        totalCells[`${g}|${c}`].textContent = sum
        all += sum
      })
    )
    grand.textContent = `${all} pièce${all > 1 ? 's' : ''}`
  }
  updateTotals()

  wrap.appendChild(table)
  card.appendChild(wrap)
  return card
}

// Gestion des couleurs du tableau : puces avec ×, et champ d'ajout.
function renderColorManager(article, data) {
  const box = el('div', 'inv-colors')
  box.appendChild(el('span', 'inv-colors-label', 'Couleurs'))

  data.colors.forEach((c) => {
    const chip = el('span', 'inv-color-chip', c)
    const del = el('button', 'inv-chip-del', '×')
    del.title = `Supprimer la couleur ${c}`
    // Double clic de confirmation : supprime aussi les quantites saisies.
    del.addEventListener('click', () => {
      if (!del.classList.contains('armed')) {
        del.classList.add('armed')
        del.textContent = 'Supprimer ?'
        setTimeout(() => {
          del.classList.remove('armed')
          del.textContent = '×'
        }, 3000)
        return
      }
      data.colors = data.colors.filter((x) => x !== c)
      Object.keys(data.qty).forEach((k) => {
        if (k.split('|')[1] === c) delete data.qty[k]
      })
      saveInventory()
      renderInventory()
    })
    chip.appendChild(del)
    box.appendChild(chip)
  })

  const input = el('input', 'inv-add-input')
  input.placeholder = 'Nouvelle couleur'
  input.dataset.colorInput = article.id
  const btn = el('button', 'draw-btn inv-add-btn', 'Ajouter')
  const add = () => {
    const color = input.value.trim().replace(/\|/g, '/')
    if (!color) return
    if (data.colors.some((c) => c.toLowerCase() === color.toLowerCase())) {
      input.classList.add('error')
      return
    }
    data.colors.push(color)
    saveInventory()
    renderInventory()
  }
  btn.addEventListener('click', add)
  input.addEventListener('keydown', (e) => {
    input.classList.remove('error')
    if (e.key === 'Enter') add()
    if (e.key === 'Escape') {
      inventoryEditing.delete(article.id)
      renderInventory()
    }
  })
  box.append(input, btn)
  return box
}
