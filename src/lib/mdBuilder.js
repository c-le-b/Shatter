// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeNewlines(str) {
  return String(str ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** Maps a file extension to its Markdown fenced-code-block language hint. */
function getLangFromPath(path = '') {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!m) return ''

  const map = {
    js: 'javascript', jsx: 'jsx',
    ts: 'typescript', tsx: 'tsx',
    json: 'json',
    css: 'css', scss: 'scss',
    html: 'html',
    md: 'markdown',
    yml: 'yaml', yaml: 'yaml',
    sh: 'bash', bash: 'bash',
    py: 'python',
    rs: 'rust',
    toml: 'toml',
    xml: 'xml',
    c: 'c', h: 'c',
    cpp: 'cpp', hpp: 'cpp',
    java: 'java',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
  }

  return map[m[1]] || m[1]
}

/**
 * Returns a backtick fence long enough to safely wrap content that may
 * itself contain backtick sequences.
 */
function safeFence(content) {
  const matches = normalizeNewlines(content).match(/`+/g) || []
  const longest = matches.reduce((max, s) => Math.max(max, s.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a Markdown Blob from an array of { path, content } chunks.
 *
 * Options:
 *   title                 - optional H1 title prepended to the document
 *   includeToc            - whether to prepend a table of contents
 *   includePathsAsHeadings - render file paths as H2 headings (default true)
 */
export function buildMdBlob(chunks, opts = {}) {
  const {
    title = '',
    includeToc = false,
    includePathsAsHeadings = true,
  } = opts

  const out = []

  if (title) {
    out.push(`# ${title}`, '')
  }

  if (includeToc) {
    out.push('## Table of Contents', '')
    chunks.forEach(({ path }) => out.push(`- ${path}`))
    out.push('')
  }

  for (const { path, content } of chunks) {
    const fence = safeFence(content)
    const lang = getLangFromPath(path)

    if (includePathsAsHeadings) {
      out.push(`## ${path}`, '')
    } else {
      out.push(path, '')
    }

    out.push(`${fence}${lang}`)
    out.push(normalizeNewlines(content))
    out.push(fence, '')
  }

  return new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' })
}