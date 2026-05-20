// src/lib/txtBuilder.js

function normalizeNewlines(str) {
  return String(str ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function buildTxtBlob(chunks, { includeSeparators = true } = {}) {
  const lines = []

  for (const { path, content } of chunks) {
    if (includeSeparators) {
      lines.push(`==== ${path} ====`)
    } else {
      lines.push(path)
    }
    lines.push(normalizeNewlines(content))
    lines.push('') // blank line between files
  }

  const text = lines.join('\n')
  return new Blob([text], { type: 'text/plain;charset=utf-8' })
}