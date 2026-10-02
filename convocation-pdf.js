// Generation du PDF de convocations (jsPDF + jspdf-autotable, charges a la
// demande par script.js depuis vendor/). Recoit des donnees deja preparees
// (ordre, rangs, classements, heures) : ce fichier ne fait que la mise en page.
;(function () {
  const BLACK = [17, 17, 17]
  const RED = [200, 16, 16]
  const GREY_TEXT = [110, 110, 110]
  const ZEBRA = [245, 245, 245]
  const MARGIN = 14

  // "09:30" -> "9h30"
  function formatTime(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '')
    return m ? `${parseInt(m[1], 10)}h${m[2]}` : '—'
  }

  function formatDate(d) {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function drawHeader(doc, data) {
    const pageWidth = doc.internal.pageSize.getWidth()
    let textX = MARGIN
    if (data.logo) {
      const h = 18
      const w = (data.logo.width / data.logo.height) * h
      try {
        doc.addImage(data.logo.dataUrl, 'PNG', MARGIN, 10, w, h)
        textX = MARGIN + w + 5
      } catch (e) {
        // logo illisible : on garde l'en-tete texte seul
      }
    }
    doc.setTextColor(...BLACK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('Convocations', textX, 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...GREY_TEXT)
    doc.text(data.subtitle, textX, 25)
    doc.text(`Édité le ${formatDate(data.date || new Date())}`, pageWidth - MARGIN, 18, { align: 'right' })

    doc.setDrawColor(...RED)
    doc.setLineWidth(0.8)
    doc.line(MARGIN, 30, pageWidth - MARGIN, 30)
    return 37
  }

  // Une paire = 2 lignes (une par joueur) : rang, classement de la paire et
  // heure sont fusionnes sur les 2 lignes ; chaque joueur a son nom, son
  // classement individuel (entre parentheses, en plus petit) et son club.
  const PLAYER_FONT = 9.5
  const PLAYER_CL_FONT = 7.5

  function drawSection(doc, y, section) {
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    // Titre + entete + au moins une paire doivent tenir ensemble sur la page.
    if (y + 30 > pageHeight - 16) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...BLACK)
    doc.text(section.title, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...RED)
    doc.text(`Convocation : ${formatTime(section.time)}`, pageWidth - MARGIN, y, { align: 'right' })

    const time = formatTime(section.time)
    const body = []
    section.rows.forEach((r) => {
      const [p1, p2] = r.players
      body.push([
        { content: r.rank, rowSpan: 2 },
        { content: r.points, rowSpan: 2 },
        { content: p1.name, player: p1 },
        p1.club || '—',
        { content: time, rowSpan: 2 },
      ])
      body.push([{ content: p2.name, player: p2 }, p2.club || '—'])
    })

    doc.autoTable({
      startY: y + 3,
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      head: [['Rang', 'Classement', 'Joueurs', 'Club', 'Convocation']],
      body,
      theme: 'plain',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: PLAYER_FONT, cellPadding: { top: 0.9, bottom: 0.9, left: 3, right: 3 }, textColor: BLACK, valign: 'middle', overflow: 'ellipsize' },
      headStyles: { fillColor: BLACK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 1.5, right: 1.5 } },
      columnStyles: {
        0: { cellWidth: 14, fontStyle: 'bold', textColor: section.accent ? RED : BLACK, halign: 'center' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 62 },
        3: { cellWidth: 60, fontSize: 8, textColor: [60, 60, 60] },
        4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (hook) => {
        if (hook.section === 'head') {
          if ([0, 1, 4].includes(hook.column.index)) hook.cell.styles.halign = 'center'
          else hook.cell.styles.cellPadding = { top: 1.8, bottom: 1.8, left: 3, right: 1.5 }
          return
        }
        // Fond alterne par paire (et non par ligne).
        if (Math.floor(hook.row.index / 2) % 2 === 1) hook.cell.styles.fillColor = ZEBRA
      },
      willDrawCell: (hook) => {
        // Le nom du joueur est dessine a la main (didDrawCell) pour pouvoir
        // ecrire le classement individuel dans une taille plus petite.
        if (hook.section === 'body' && hook.cell.raw && hook.cell.raw.player) hook.cell.text = []
      },
      didDrawCell: (hook) => {
        if (hook.section === 'body' && hook.cell.raw && hook.cell.raw.player) {
          const p = hook.cell.raw.player
          const x = hook.cell.x + hook.cell.padding('left')
          const cy = hook.cell.y + hook.cell.height / 2
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(PLAYER_FONT)
          doc.setTextColor(...BLACK)
          doc.text(p.name, x, cy, { baseline: 'middle' })
          const w = doc.getTextWidth(p.name)
          doc.setFontSize(PLAYER_CL_FONT)
          doc.setTextColor(...GREY_TEXT)
          doc.text(`(${p.classement || 'NC'})`, x + w + 1.5, cy + 0.3, { baseline: 'middle' })
        }
        // Trait fin sous chaque paire pour bien separer les paires.
        if (hook.section === 'body' && hook.row.index % 2 === 1 && hook.column.index === 2) {
          doc.setDrawColor(220, 220, 220)
          doc.setLineWidth(0.2)
          doc.line(MARGIN, hook.cell.y + hook.cell.height, pageWidth - MARGIN, hook.cell.y + hook.cell.height)
        }
      },
    })
    return doc.lastAutoTable.finalY + 8
  }

  function drawFooters(doc, data) {
    const n = doc.getNumberOfPages()
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    for (let i = 1; i <= n; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...GREY_TEXT)
      doc.text(data.footer || '', MARGIN, h - 8)
      doc.text(`Page ${i} / ${n}`, w - MARGIN, h - 8, { align: 'right' })
    }
  }

  // data = { subtitle, footer, date, logo?: { dataUrl, width, height },
  //          sections: [{ title, time, accent, rows: [{ rank, points, players: [{ name, classement, club }, x2] }] }] }
  function buildConvocationPdf(jsPDF, data) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    let y = drawHeader(doc, data)
    data.sections.filter((s) => s.rows.length).forEach((s) => {
      y = drawSection(doc, y, s)
    })
    drawFooters(doc, data)
    return doc
  }

  const api = { buildConvocationPdf, formatTime }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else window.ConvocationPdf = api
})()
