import { jsPDF } from 'jspdf'

function normalizeNewlines(str) {
  return String(str ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Builds a PDF Blob from an array of { path, content } chunks.
 * Uses jsPDF with Courier (a core font) for a monospaced, source-code feel.
 *
 * Options:
 *   title      - text rendered at the top of the first page
 *   fontSize   - font size in points (default 9)
 *   margin     - page margin in mm (default 12)
 *   lineHeight - vertical spacing per line in mm (default 4.2)
 */
export async function buildPdfBlob(chunks, opts = {}) {
  const {
    title = 'Export',
    fontSize = 9,
    margin = 12,
    lineHeight = 4.2,
  } = opts

  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true })

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

  if (title) {
    doc.setFont('courier', 'bold')
    doc.text(title, x, y)
    y += lineHeight * 2
    doc.setFont('courier', 'normal')
  }

  for (const { path, content } of chunks) {
    // File path header
    doc.setFont('courier', 'bold')
    const headerLines = doc.splitTextToSize(`==== ${path} ====`, usableWidth)
    for (const line of headerLines) {
      newPageIfNeeded()
      doc.text(line, x, y)
      y += lineHeight
    }
    y += lineHeight * 0.5
    doc.setFont('courier', 'normal')

    // File content
    for (const raw of normalizeNewlines(content).split('\n')) {
      const wrapped = doc.splitTextToSize(raw.length ? raw : ' ', usableWidth)
      for (const line of wrapped) {
        newPageIfNeeded()
        doc.text(line, x, y)
        y += lineHeight
      }
    }

    y += lineHeight * 1.5
    newPageIfNeeded()
  }

  return doc.output('blob')
}