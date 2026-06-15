function normalizeNewlines(str) {
  return String(str ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Builds a plain-text Blob from an array of { path, content } chunks.
 *
 * Options:
 *   includeSeparators - wraps each file path in ==== delimiters (default true)
 */
export function buildTxtBlob(chunks, { includeSeparators = true } = {}) {
  const lines = []

  for (const { path, content } of chunks) {
    lines.push(includeSeparators ? `==== ${path} ====` : path)
    lines.push(normalizeNewlines(content))
    lines.push('') // blank line between files
  }

  return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
}