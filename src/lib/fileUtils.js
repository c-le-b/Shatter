import { invoke } from '@tauri-apps/api/core'

// ---------------------------------------------------------------------------
// Default filter sets
// ---------------------------------------------------------------------------

/** File extensions included in exports by default. */
export const DEFAULT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.css', '.scss',
  '.html',
  '.json',
  '.md',
  '.yml', '.yaml',
  '.cjs', '.mjs',
])

/** Directory names skipped during traversal by default. */
export const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build',
  '.git', '.next', '.turbo', '.cache',
  '__pycache__',
])

/** Base filenames excluded from exports by default. */
export const DEFAULT_EXCLUDE_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

/**
 * Extensions treated as UTF-8 text. Anything outside this set is skipped
 * during scanning and export to avoid garbled binary content.
 */
export const TEXT_LIKE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.css', '.scss',
  '.html',
  '.json',
  '.md',
  '.yml', '.yaml',
  '.cjs', '.mjs',
  '.txt',
  '.toml',
  '.rs',
  '.py',
  '.sh',
  '.ini',
  '.env',
  '.csv',
  '.xml',
])

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Returns the lowercased extension including the dot (e.g. ".jsx"), or "" if none. */
export function getExtension(filename) {
  const i = String(filename ?? '').lastIndexOf('.')
  return i >= 0 ? String(filename).slice(i).toLowerCase() : ''
}

/** Replaces the top-level folder segment in a relative path with rootLabel. */
export function getRelativePath(file, rootLabel) {
  const raw = file?.webkitRelativePath || file?.name || ''
  return raw.replace(/^[^/]+/, rootLabel || 'project')
}

/** Returns the lowercased base filename (last path segment). */
function getBaseName(file) {
  const path = file?.webkitRelativePath || file?.name || ''
  const parts = path.split('/')
  return String(parts[parts.length - 1] || file?.name || '').toLowerCase()
}

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

/**
 * Returns true if the file should be included in the export.
 *
 * Rules (all must pass):
 *  1. Extension is in includedExts
 *  2. Base filename is not in excludeFiles
 *  3. No ancestor directory segment is in skipDirs
 */
export function isFileIncluded(file, includedExts, skipDirs, excludeFiles = new Set()) {
  const ext = getExtension(file?.name || '')
  if (!includedExts?.has(ext)) return false

  const baseName = getBaseName(file)
  const normalizedExcludes = new Set([...(excludeFiles || [])].map(s => String(s).toLowerCase()))
  if (normalizedExcludes.has(baseName)) return false

  const path = file?.webkitRelativePath || file?.name || ''
  const segments = path.split('/').map(s => String(s).toLowerCase())
  const normalizedSkips = new Set([...(skipDirs || [])].map(s => String(s).toLowerCase()))

  // Check directory segments only (not the filename at the end)
  for (let i = 0; i < segments.length - 1; i++) {
    if (normalizedSkips.has(segments[i])) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Character count of a string. */
export function countChars(str) {
  return String(str ?? '').length
}

/**
 * Rough token estimate using the ~4 chars/token heuristic.
 * Good enough for GPT-family models; not a substitute for a real tokenizer.
 */
export function estimateTokens(str) {
  const s = String(str ?? '')
  return s ? Math.ceil(s.length / 4) : 0
}

/** Human-readable file size string. */
export function formatBytes(bytes) {
  const b = Number(bytes ?? 0)
  if (b < 1024) return `${b}B`
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / 1_048_576).toFixed(1)}MB`
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/**
 * Reads a file as UTF-8 text.
 * - If the file was scanned by Rust (has __absPath), delegates to the Tauri command.
 * - Otherwise uses the browser FileReader API.
 */
export function readFileAsText(file) {
  if (file?.__absPath) {
    return invoke('read_text', { path: file.__absPath })
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file?.name ?? 'file'}`))
    reader.readAsText(file, 'utf-8')
  })
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Splits a long string into chunks no larger than maxChars, preferring
 * newline boundaries to avoid cutting mid-line.
 */
function splitByBestNewline(content, maxChars) {
  const text = String(content ?? '')
  if (text.length <= maxChars) return [text]

  const out = []
  let start = 0
  const forwardSearchLimit = Math.min(2000, Math.floor(maxChars * 0.2))
  const minChunkSize = Math.max(200, Math.floor(maxChars * 0.6))

  while (start < text.length) {
    const hardEnd = Math.min(start + maxChars, text.length)

    if (hardEnd >= text.length) {
      out.push(text.slice(start))
      break
    }

    const window = text.slice(start, hardEnd)
    let cut = window.lastIndexOf('\n')

    // Discard a cut that's too close to the beginning — it produces tiny chunks.
    if (cut >= 0 && cut < minChunkSize) cut = -1

    if (cut >= 0) {
      const end = start + cut + 1
      out.push(text.slice(start, end))
      start = end
      continue
    }

    // Try looking just past the hard boundary for the next newline.
    const forwardSlice = text.slice(hardEnd, Math.min(hardEnd + forwardSearchLimit, text.length))
    const nextNl = forwardSlice.indexOf('\n')
    if (nextNl >= 0) {
      const end = hardEnd + nextNl + 1
      out.push(text.slice(start, end))
      start = end
      continue
    }

    // No newline found — hard cut.
    out.push(text.slice(start, hardEnd))
    start = hardEnd
  }

  return out
}

/**
 * Builds an array of document parts by reading each included file and
 * packing its content into chunks bounded by maxChars.
 *
 * Each part has the shape:
 *   { num, chunks: [{ path, content }], charCount, tokenEstimate }
 *
 * @param {File[]} files
 * @param {Set<string>} includedExts
 * @param {Set<string>} skipDirs
 * @param {string} rootLabel
 * @param {number} maxChars
 * @param {Function} [onProgress]
 * @param {Set<string>} [excludeFiles]
 */
export async function buildDocumentParts(
  files,
  includedExts,
  skipDirs,
  rootLabel,
  maxChars,
  onProgress,
  excludeFiles = new Set(),
) {
  const safeMaxChars = Math.max(500, Number(maxChars ?? 10_000))

  // Apply all filter rules, then drop non-text-like files with a counter.
  const included = (files ?? []).filter(f => isFileIncluded(f, includedExts, skipDirs, excludeFiles))

  let skippedNonText = 0
  const eligible = included.filter(f => {
    if (TEXT_LIKE_EXTENSIONS.has(getExtension(f?.name || ''))) return true
    skippedNonText++
    return false
  })

  const parts = []
  let currentChunks = []
  let currentChars = 0
  let docNum = 1

  let totalChars = 0
  let totalTokens = 0
  let processedFiles = 0

  const flush = () => {
    if (currentChunks.length === 0) return
    parts.push({
      num: docNum,
      chunks: currentChunks,
      charCount: currentChars,
      tokenEstimate: Math.ceil(currentChars / 4),
    })
    docNum++
    currentChunks = []
    currentChars = 0
  }

  for (const file of eligible) {
    const relPath = getRelativePath(file, rootLabel)

    let content = ''
    try {
      content = await readFileAsText(file)
    } catch (e) {
      content = `[ERROR READING FILE: ${e?.message || String(e)}]`
    }

    const chars = countChars(content)
    const tokens = estimateTokens(content)

    if (chars > safeMaxChars) {
      // File is larger than one chunk — split it first.
      const slices = splitByBestNewline(content, safeMaxChars)
      let sliceIndex = 1
      for (const slice of slices) {
        const sliceChars = countChars(slice)
        const sliceTokens = estimateTokens(slice)

        if (currentChars + sliceChars > safeMaxChars && currentChunks.length > 0) flush()

        currentChunks.push({
          path: `${relPath} (part ${sliceIndex}/${slices.length})`,
          content: slice,
        })
        currentChars += sliceChars
        totalChars += sliceChars
        totalTokens += sliceTokens

        if (currentChars >= safeMaxChars) flush()
        sliceIndex++
      }
    } else {
      // File fits in one chunk; flush first if it would overflow the current doc.
      if (currentChars + chars > safeMaxChars && currentChunks.length > 0) flush()

      currentChunks.push({ path: relPath, content })
      currentChars += chars
      totalChars += chars
      totalTokens += tokens
    }

    processedFiles++

    onProgress?.({
      processedFiles,
      totalFiles: eligible.length,
      totalChars,
      totalTokens,
      currentDocNum: docNum,
      relPath,
      skippedNonText,
    })

    // Yield to the event loop so the UI stays responsive.
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 0))
  }

  flush()
  return parts
}