export const DEFAULT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.css', '.scss',
  '.html',
  '.json',
  '.md',
  '.yml', '.yaml',
  '.cjs', '.mjs',
])

export const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build',
  '.git', '.next', '.turbo', '.cache',
  '__pycache__',
])

export function getExtension(filename) {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

export function getRelativePath(file, rootLabel) {
  const raw = file.webkitRelativePath || file.name
  return raw.replace(/^[^/]+/, rootLabel)
}

export function isFileIncluded(file, includedExts, skipDirs) {
  const ext = getExtension(file.name);
  if (!includedExts.has(ext)) return false;

  const path = file.webkitRelativePath || file.name;
  const segments = path.split('/').map(s => s.toLowerCase());

  const normalizedSkips = new Set([...skipDirs].map(s => s.toLowerCase()));

  for (let i = 0; i < segments.length - 1; i++) {
    if (normalizedSkips.has(segments[i])) return false;
  }

  return true;
}


export function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

export async function buildDocumentParts(files, includedExts, skipDirs, rootLabel, maxWords, onProgress) {
  const included = files.filter(f => isFileIncluded(f, includedExts, skipDirs))
  const parts = []
  let currentChunks = []
  let currentWords = 0
  let docNum = 1
  let totalWords = 0
  let processedFiles = 0

  const flush = () => {
    if (currentChunks.length === 0) return
    parts.push({ num: docNum, chunks: currentChunks, wordCount: currentWords })
    docNum++
    currentChunks = []
    currentWords = 0
  }

  for (const file of included) {
    const relPath = getRelativePath(file, rootLabel)
    let content
    try {
      content = await readFileAsText(file)
    } catch (e) {
      content = `[ERROR READING FILE: ${e.message}]`
    }

    const words = countWords(content)
    totalWords += words

    if (currentWords + words > maxWords && currentChunks.length > 0) {
      flush()
    }

    currentChunks.push({ path: relPath, content })
    currentWords += words
    processedFiles++

    onProgress?.({ processedFiles, totalFiles: included.length, totalWords, currentDocNum: docNum, relPath })

    await new Promise(r => setTimeout(r, 0))
  }

  flush()
  return parts
}
