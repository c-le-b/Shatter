// src/lib/pdfBuilder.js

import { jsPDF } from 'jspdf'

function normalizeNewlines(str) {
  return String(str ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// Simple, robust PDF output using a monospaced font and wrapped lines.
// This is meant for "source export" readability, not fancy layout.
export async function buildPdfBlob(chunks, opts = {}) {
  const {
    title = 'Export',
    fontSize = 9,
    margin = 12,
    lineHeight = 4.2,
  } = opts

  const doc = new jsPDF({
    unit: 'mm',
    format: 'letter',
    compress: true,
  })

  // Monospace-like feel (Courier is available in jsPDF core fonts)
  doc.setFont('courier', 'normal')
  doc.setFontSize(fontSize)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2

  let x = margin
  let y = margin

  const newPageIfNeeded = () => {
    if (y > margin + usableHeight) {
      doc.addPage()
      y = margin
      x = margin
      doc.setFont('courier', 'normal')
      doc.setFontSize(fontSize)
    }
  }

  // Optional title on first page
  if (title) {
    doc.setFont('courier', 'bold')
    doc.text(title, x, y)
    y += lineHeight * 2
    doc.setFont('courier', 'normal')
  }

  for (const { path, content } of chunks) {
    // File header
    doc.setFont('courier', 'bold')
    const headerLines = doc.splitTextToSize(`==== ${path} ====`, usableWidth)
    for (const hl of headerLines) {
      newPageIfNeeded()
      doc.text(hl, x, y)
      y += lineHeight
    }
    y += lineHeight * 0.5
    doc.setFont('courier', 'normal')

    // File content
    const text = normalizeNewlines(content)
    const rawLines = text.split('\n')

    for (const raw of rawLines) {
      // Wrap each line to fit the page width
      const wrapped = doc.splitTextToSize(raw.length ? raw : ' ', usableWidth)
      for (const w of wrapped) {
        newPageIfNeeded()
        doc.text(w, x, y)
        y += lineHeight
      }
    }

    // Spacing between files
    y += lineHeight * 1.5
    newPageIfNeeded()
  }

  // jsPDF can output a Blob directly
  return doc.output('blob')
}