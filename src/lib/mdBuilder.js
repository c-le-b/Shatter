// src/lib/mdBuilder.js

function normalizeNewlines(str) {
  return String(str ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function getLangFromPath(path = '') {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!m) return ''
  const ext = m[1]

  // reasonable mapping for common project files
  const map = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    py: 'python',
    rs: 'rust',
    toml: 'toml',
    xml: 'xml',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    java: 'java',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
  }

  return map[ext] || ext
}

function fenceSafe(content) {
  // If the content contains ``` we need a longer fence.
  // Find the longest run of backticks and add one.
  const matches = normalizeNewlines(content).match(/`+/g) || []
  const longest = matches.reduce((max, s) => Math.max(max, s.length), 0)
  const fenceLen = Math.max(3, longest + 1)
  return '`'.repeat(fenceLen)
}

export function buildMdBlob(chunks, opts = {}) {
  const {
    title = '',
    includeToc = false,
    includePathsAsHeadings = true,
  } = opts

  const out = []

  if (title) {
    out.push(`# ${title}`)
    out.push('')
  }

  if (includeToc) {
    out.push('## Table of Contents')
    out.push('')
    chunks.forEach(({ path }) => {
      // Basic TOC entry. (Not perfect anchor normalization, but useful.)
      out.push(`- ${path}`)
    })
    out.push('')
  }

  for (const { path, content } of chunks) {
    const safeFence = fenceSafe(content)
    const lang = getLangFromPath(path)

    if (includePathsAsHeadings) {
      out.push(`## ${path}`)
      out.push('')
    } else {
      out.push(path)
      out.push('')
    }

    // Fenced code block for best LLM ingestion
    out.push(`${safeFence}${lang ? lang : ''}`)
    out.push(normalizeNewlines(content))
    out.push(`${safeFence}`)
    out.push('')
  }

  const md = out.join('\n')
  return new Blob([md], { type: 'text/markdown;charset=utf-8' })
}