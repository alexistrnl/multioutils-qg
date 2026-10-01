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
    doc.line(MARGIN, 32, pageWidth - MARGIN, 32)
    return 40
  }

  function drawSection(doc, y, section) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(...BLACK)
    doc.text(section.title, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...RED)
    doc.text(`Convocation : ${formatTime(section.time)}`, doc.internal.pageSize.getWidth() - MARGIN, y, { align: 'right' })

    doc.autoTable({
      startY: y + 3,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Rang', 'Classement', 'Joueur 1', 'Joueur 2', 'Convocation']],
      body: section.rows.map((r) => [r.rank, r.points, r.j1, r.j2, formatTime(section.time)]),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10.5, cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 }, textColor: BLACK, valign: 'middle' },
      headStyles: { fillColor: BLACK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 18, fontStyle: 'bold', textColor: section.accent ? RED : BLACK, halign: 'center' },
        1: { cellWidth: 26, halign: 'center' },
        2: { cellWidth: 55 },
        3: { cellWidth: 55 },
        4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (hook) => {
        if (hook.section === 'head' && [0, 1, 4].includes(hook.column.index)) hook.cell.styles.halign = 'center'
      },
    })
    return doc.lastAutoTable.finalY + 12
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
  //          sections: [{ title, time, accent, rows: [{ rank, points, j1, j2 }] }] }
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
