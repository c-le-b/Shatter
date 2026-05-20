// src/lib/fileUtils.js

import { invoke } from '@tauri-apps/api/core'

// Default file extensions included in exports
export const DEFAULT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.css', '.scss',
  '.html',
  '.json',
  '.md',
  '.yml', '.yaml',
  '.cjs', '.mjs',
])

// Default directories skipped during filtering
export const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build',
  '.git', '.next', '.turbo', '.cache',
  '__pycache__',
])

// NEW: Default excluded filenames (base names)
export const DEFAULT_EXCLUDE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

// Extensions that are safe to treat as UTF-8 text for scanning/export.
// This prevents huge bogus counts when someone accidentally includes pdf/docx/images/etc.
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

export function getExtension(filename) {
  const i = String(filename ?? '').lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

export function getRelativePath(file, rootLabel) {
  const raw = file?.webkitRelativePath || file?.name || ''
  return raw.replace(/^[^/]+/, rootLabel || 'project')
}

function normalizeSetLower(setLike) {
  return new Set([...(setLike || new Set())].map(s => String(s).toLowerCase()))
}

function getBaseName(file) {
  const path = file?.webkitRelativePath || file?.name || ''
  const parts = path.split('/')
  return String(parts[parts.length - 1] || file?.name || '').toLowerCase()
}

function isExcludedByName(file, excludeFiles) {
  if (!excludeFiles || excludeFiles.size === 0) return false
  const base = getBaseName(file)
  const normalizedExcludes = normalizeSetLower(excludeFiles)
  return normalizedExcludes.has(base)
}

export function isFileIncluded(file, includedExts, skipDirs, excludeFiles = new Set()) {
  const ext = getExtension(file?.name || '')
  if (!includedExts?.has(ext)) return false

  // NEW: exclude by filename
  if (isExcludedByName(file, excludeFiles)) return false

  const path = file?.webkitRelativePath || file?.name || ''
  const segments = path.split('/').map(s => String(s).toLowerCase())
  const normalizedSkips = normalizeSetLower(skipDirs)

  // Check all directory segments except the filename segment
  for (let i = 0; i < segments.length - 1; i++) {
    if (normalizedSkips.has(segments[i])) return false
  }
  return true
}

/**
 * Character count (simple and fast).
 */
export function countChars(str) {
  return String(str ?? '').length
}

/**
 * Fast token estimate for GPT-style tokenization.
 */
export function estimateTokens(str) {
  const s = String(str ?? '')
  if (!s) return 0
  return Math.ceil(s.length / 4)
}

export function formatBytes(bytes) {
  const b = Number(bytes ?? 0)
  if (b < 1024) return `${b}B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / 1048576).toFixed(1)}MB`
}


export function readFileAsText(file) {
  // If this is a "scanned" file from Rust, it will carry an absolute path
  // we can read via the Rust command.
  if (file && file.__absPath) {
    return invoke('read_text', { path: file.__absPath })
  }

  // Original browser behavior (kept)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file?.name ?? 'file'}`))
    reader.readAsText(file, 'utf-8')
  })
}

function isTextLikeFile(file) {
  const ext = getExtension(file?.name || '')
  return TEXT_LIKE_EXTENSIONS.has(ext)
}

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

    if (cut >= 0 && cut < minChunkSize) cut = -1

    if (cut >= 0) {
      const end = start + cut + 1
      out.push(text.slice(start, end))
      start = end
      continue
    }

    const forwardEnd = Math.min(hardEnd + forwardSearchLimit, text.length)
    const forwardSlice = text.slice(hardEnd, forwardEnd)
    const nextNl = forwardSlice.indexOf('\n')
    if (nextNl >= 0) {
      const end = hardEnd + nextNl + 1
      out.push(text.slice(start, end))
      start = end
      continue
    }

    out.push(text.slice(start, hardEnd))
    start = hardEnd
  }

  return out
}

/**
 * Build document parts by splitting INCLUDED files into chunks capped by maxChars.
 *
 * NEW: Optional excludeFiles parameter (base filenames).
 *
 * onProgress payload includes:
 * { processedFiles, totalFiles, totalChars, totalTokens, currentDocNum, relPath, skippedNonText }
 */
export async function buildDocumentParts(
  files,
  includedExts,
  skipDirs,
  rootLabel,
  maxChars,
  onProgress,
  excludeFiles = new Set()
) {
  const safeMaxChars = Math.max(500, Number(maxChars ?? 10000))

  // Filter by include/skip/exclude rules
  const included = (files ?? []).filter(f => isFileIncluded(f, includedExts, skipDirs, excludeFiles))

  // Enforce text-like safety
  let skippedNonText = 0
  const eligible = []
  for (const f of included) {
    if (!isTextLikeFile(f)) {
      skippedNonText++
      continue
    }
    eligible.push(f)
  }

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

    const slices = splitByBestNewline(content, safeMaxChars)

    if (slices.length > 1) {
      let sliceIndex = 1
      for (const slice of slices) {
        const sliceChars = countChars(slice)
        const sliceTokens = estimateTokens(slice)

        if (currentChars + sliceChars > safeMaxChars && currentChunks.length > 0) flush()

        currentChunks.push({
          path: `${relPath} (split ${sliceIndex}/${slices.length})`,
          content: slice,
        })
        currentChars += sliceChars
        totalChars += sliceChars
        totalTokens += sliceTokens

        if (currentChars >= safeMaxChars) flush()
        sliceIndex++
      }
    } else {
      const chars = countChars(content)
      const tokens = estimateTokens(content)

      if (currentChars + chars > safeMaxChars && currentChunks.length > 0) flush()

      if (chars > safeMaxChars) {
        const bigSlices = splitByBestNewline(content, safeMaxChars)
        let i = 1
        for (const slice of bigSlices) {
          const sliceChars = countChars(slice)
          const sliceTokens = estimateTokens(slice)

          if (currentChars + sliceChars > safeMaxChars && currentChunks.length > 0) flush()

          currentChunks.push({
            path: `${relPath} (split ${i}/${bigSlices.length})`,
            content: slice,
          })
          currentChars += sliceChars
          totalChars += sliceChars
          totalTokens += sliceTokens

          if (currentChars >= safeMaxChars) flush()
          i++
        }
      } else {
        currentChunks.push({ path: relPath, content })
        currentChars += chars
        totalChars += chars
        totalTokens += tokens
      }
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

    // keep UI responsive
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 0))
  }

  flush()
  return parts
}