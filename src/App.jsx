// src/App.jsx
import { useState, useCallback, useEffect } from 'react'
import DropZone from './components/DropZone'
import FileList from './components/FileList'
import TagInput from './components/TagInput'
import ExportLog from './components/ExportLog'
import StatCard from './components/StatCard'
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  DEFAULT_EXCLUDE_FILES,
  isFileIncluded,
  buildDocumentParts,
  readFileAsText,
  countChars,
  estimateTokens,
  TEXT_LIKE_EXTENSIONS,
} from './lib/fileUtils'
import { buildDocxBlob, downloadBlob } from './lib/docxBuilder'
import { buildTxtBlob } from './lib/txtBuilder'
import { buildPdfBlob } from './lib/pdfBuilder'
import { buildMdBlob } from './lib/mdBuilder'
import styles from './App.module.css'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import shatterLogoWide from '../dist/assets/shatter-logo-wide.png'

const STATUS = { IDLE: 'idle', RUNNING: 'running', DONE: 'done' }

function getExt(name = '') {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export default function App() {
  const [files, setFiles] = useState([])
  const [includedExts, setIncludedExts] = useState(new Set(DEFAULT_EXTENSIONS))
  const [skipDirs, setSkipDirs] = useState(new Set(DEFAULT_SKIP_DIRS))
  const [excludeFiles, setExcludeFiles] = useState(new Set(DEFAULT_EXCLUDE_FILES))

  const [maxChars, setMaxChars] = useState(10000)
  const [maxCharsRaw, setMaxCharsRaw] = useState('10000')
  const [rootLabel, setRootLabel] = useState('project')

  const [status, setStatus] = useState(STATUS.IDLE)
  const [logEntries, setLogEntries] = useState([])
  const [progress, setProgress] = useState(0)

  const [stats, setStats] = useState({ files: 0, chars: 0, tokens: 0, docs: 0 })
  const [exportFormat, setExportFormat] = useState('md')

  const [scanKey, setScanKey] = useState(0)
  const [scanTotals, setScanTotals] = useState({
    chars: 0,
    tokens: 0,
    scanning: false,
    skippedNonText: 0,
  })

  const addLog = useCallback((text, type = 'info') => {
    setLogEntries(prev => [...prev, { text, type }])
  }, [])

  const handleFiles = useCallback((incoming) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}::${f.size}::${f.webkitRelativePath || ''}`))
      return [
        ...prev,
        ...incoming.filter(f => !existing.has(`${f.name}::${f.size}::${f.webkitRelativePath || ''}`)),
      ]
    })
  }, [])

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const addExt = useCallback((val) => {
    const ext = val.startsWith('.') ? val.toLowerCase() : `.${val.toLowerCase()}`
    setIncludedExts(prev => new Set([...prev, ext]))
  }, [])
  const removeExt = useCallback((val) => {
    setIncludedExts(prev => {
      const s = new Set(prev)
      s.delete(val)
      return s
    })
  }, [])

  const addSkip = useCallback((val) => {
    setSkipDirs(prev => new Set([...prev, val]))
  }, [])
  const removeSkip = useCallback((val) => {
    setSkipDirs(prev => {
      const s = new Set(prev)
      s.delete(val)
      return s
    })
  }, [])

  const addExclude = useCallback((val) => {
    const name = String(val || '').trim()
    if (!name) return
    setExcludeFiles(prev => new Set([...prev, name.toLowerCase()]))
  }, [])
  const removeExclude = useCallback((val) => {
    setExcludeFiles(prev => {
      const s = new Set(prev)
      s.delete(String(val).toLowerCase())
      return s
    })
  }, [])

  const includedCount = files.filter(f => isFileIncluded(f, includedExts, skipDirs, excludeFiles)).length
  const isRunning = status === STATUS.RUNNING

  // Pre-scan (text-like only)
  useEffect(() => {
    if (isRunning) return
    let cancelled = false

    const run = async () => {
      const included = files.filter(f => isFileIncluded(f, includedExts, skipDirs, excludeFiles))
      if (included.length === 0) {
        setScanTotals({ chars: 0, tokens: 0, scanning: false, skippedNonText: 0 })
        return
      }

      setScanTotals(s => ({ ...s, chars: 0, tokens: 0, scanning: true, skippedNonText: 0 }))

      let totalChars = 0
      let totalTokens = 0
      let skippedNonText = 0

      for (const file of included) {
        if (cancelled) return

        const ext = getExt(file.name)
        if (!TEXT_LIKE_EXTENSIONS.has(ext)) {
          skippedNonText++
          continue
        }

        let content = ''
        try {
          content = await readFileAsText(file)
        } catch {
          content = ''
        }

        totalChars += countChars(content)
        totalTokens += estimateTokens(content)
        await new Promise(r => setTimeout(r, 0))
      }

      if (!cancelled) {
        setScanTotals({ chars: totalChars, tokens: totalTokens, scanning: false, skippedNonText })
      }
    }

    run()
    return () => { cancelled = true }
  }, [files, includedExts, skipDirs, excludeFiles, isRunning, scanKey])

  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen('shatter://dropped', async (event) => {
        try {
          const droppedPaths = event.payload || []
          if (!Array.isArray(droppedPaths) || droppedPaths.length === 0) return

          addLog(`Dropped ${droppedPaths.length} path(s) — scanning…`)

          const scanned = await invoke('scan_paths', { paths: droppedPaths })
          if (!Array.isArray(scanned) || scanned.length === 0) {
            addLog('No files found in dropped path(s).', 'warn')
            return
          }

          // Convert scanned entries into "file-like" objects your app already understands.
          const fileLikes = scanned.map((f) => ({
            name: f.name,
            size: f.size,
            webkitRelativePath: f.rel_path,
            __absPath: f.abs_path
          }))

          handleFiles(fileLikes)
          addLog(`Added ${fileLikes.length} file(s) from dropped folder(s).`, 'ok')
        } catch (e) {
          addLog(`Drop scan failed: ${e?.message ?? String(e)}`, 'err')
        }
      })

      return unlisten
    }

    let cleanup
    setup().then((u) => { cleanup = u })

    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [addLog, handleFiles])


  const handleExport = async () => {
    setStatus(STATUS.RUNNING)
    setLogEntries([])
    setProgress(0)
    setStats({ files: 0, chars: 0, tokens: 0, docs: 0 })

    const included = files.filter(f => isFileIncluded(f, includedExts, skipDirs, excludeFiles))
    addLog(`Starting export — ${included.length} files, max ${maxChars.toLocaleString()} chars/doc`)

    try {
      const parts = await buildDocumentParts(
        files,
        includedExts,
        skipDirs,
        rootLabel,
        maxChars,
        ({ processedFiles, totalChars, totalTokens, currentDocNum }) => {
          setProgress(processedFiles ?? 0)
          setStats({
            files: processedFiles ?? 0,
            chars: totalChars ?? 0,
            tokens: typeof totalTokens === 'number' ? totalTokens : Math.ceil((totalChars ?? 0) / 4),
            docs: currentDocNum ?? 0,
          })
        },
        excludeFiles
      )

      setStats(s => ({ ...s, docs: parts.length }))

      const label = exportFormat.toUpperCase()
      addLog(`Processing complete — building ${parts.length} ${label} file(s)…`)

      for (const part of parts) {
        const ext =
          exportFormat === 'docx' ? 'docx' :
          exportFormat === 'pdf' ? 'pdf' :
          exportFormat === 'md' ? 'md' : 'txt'

        const fname = `${rootLabel}_part_${part.num}.${ext}`
        addLog(`Building ${fname} (${(part.charCount ?? 0).toLocaleString()} chars, ${part.chunks.length} files)…`)

        let blob
        if (exportFormat === 'docx') blob = await buildDocxBlob(part.chunks)
        else if (exportFormat === 'pdf') blob = await buildPdfBlob(part.chunks, { title: `${rootLabel} — part ${part.num}` })
        else if (exportFormat === 'md') blob = buildMdBlob(part.chunks, { title: `${rootLabel} — part ${part.num}` })
        else blob = buildTxtBlob(part.chunks)

        downloadBlob(blob, fname)
        addLog(`Downloaded ${fname}`, 'ok')
        await new Promise(r => setTimeout(r, 350))
      }

      addLog(`Done! ${parts.length} file(s) exported successfully.`, 'ok')
      setStatus(STATUS.DONE)
    } catch (err) {
      addLog(`Export failed: ${err?.message ?? String(err)}`, 'err')
      setStatus(STATUS.IDLE)
    }
  }

  const handleReset = () => {
    setFiles([])
    setLogEntries([])
    setProgress(0)
    setStats({ files: 0, chars: 0, tokens: 0, docs: 0 })
    setScanTotals({ chars: 0, tokens: 0, scanning: false, skippedNonText: 0 })
    setStatus(STATUS.IDLE)
  }

  const handleRefresh = () => {
    setScanKey(k => k + 1)
  }

  const showLog = logEntries.length > 0

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <img
            src={shatterLogoWide}
            alt="Shatter"
            className={styles.logoImg}
            draggable="false"
          />
        </div>

        <nav className={styles.nav}>
          <a href="#files" className={styles.navItem}>
            <i className="ti ti-files" aria-hidden="true" /> Files
            {files.length > 0 && <span className={styles.badge}>{files.length}</span>}
          </a>
          <a href="#config" className={styles.navItem}>
            <i className="ti ti-settings" aria-hidden="true" /> Config
          </a>
          <a href="#filters" className={styles.navItem}>
            <i className="ti ti-filter" aria-hidden="true" /> Filters
          </a>
          {showLog && (
            <a href="#output" className={styles.navItem}>
              <i className="ti ti-terminal" aria-hidden="true" /> Output
            </a>
          )}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.hint}>
            <i className="ti ti-info-circle" aria-hidden="true" />
            Use folder upload to preserve directory structure. Exports are built from included files only.
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.title}>Project → Shatter</div>
          <div className={styles.subtitle}>
            Upload your project, configure chunking, and download split documents — ready to paste into any LLM context window.
          </div>
        </header>

        <section id="files" className={styles.section}>
          <div className={styles.sectionTitle}>
            <i className="ti ti-files" aria-hidden="true" /> Project files
          </div>

          <DropZone onFiles={handleFiles} />
          <FileList files={files} includedExts={includedExts} skipDirs={skipDirs} onRemove={removeFile} />

          {files.length > 0 && (
            <>
              <div className={styles.scanSummary}>
                <StatCard value={scanTotals.scanning ? 'Scanning…' : scanTotals.chars.toLocaleString()} label="Included chars (text-like)" />
                <StatCard value={scanTotals.scanning ? 'Scanning…' : scanTotals.tokens.toLocaleString()} label="Estimated tokens" />
                <StatCard value={includedCount.toLocaleString()} label="Included files (after excludes)" />
              </div>

              {scanTotals.skippedNonText > 0 && (
                <div className={styles.scanNote}>
                  Skipped {scanTotals.skippedNonText.toLocaleString()} non-text file(s) from scan totals
                </div>
              )}
            </>
          )}
        </section>

        <section id="config" className={styles.section}>
          <div className={styles.sectionTitle}>
            <i className="ti ti-settings" aria-hidden="true" /> Configuration
          </div>

          <div className={styles.configGrid}>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Max characters per document</div>
              <input
                className={styles.fieldInput}
                type="text"
                inputMode="numeric"
                value={maxCharsRaw}
                disabled={isRunning}
                onChange={(e) => setMaxCharsRaw(e.target.value)}
                onBlur={(e) => {
                  const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
                  const clamped = isNaN(n) || n < 500 ? 500 : n
                  setMaxChars(clamped)
                  setMaxCharsRaw(String(clamped))
                }}
              />
              <div className={styles.fieldHint}>Files split when this character limit is reached</div>
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>Root folder label</div>
              <input
                className={styles.fieldInput}
                value={rootLabel}
                disabled={isRunning}
                onChange={(e) => setRootLabel(e.target.value)}
                placeholder="project"
              />
              <div className={styles.fieldHint}>Top-level path prefix in output docs</div>
            </div>
          </div>
        </section>

        <section id="filters" className={styles.section}>
          <div className={styles.sectionTitle}>
            <i className="ti ti-filter" aria-hidden="true" /> Filters
          </div>

          <div className={styles.filterGrid}>
            <TagInput
              label="Include extensions"
              tags={includedExts}
              onAdd={addExt}
              onRemove={removeExt}
              placeholder=".js .ts .md"
            />

            <TagInput
              label="Skip directories"
              tags={skipDirs}
              onAdd={addSkip}
              onRemove={removeSkip}
              placeholder="node_modules dist .git"
            />

            <TagInput
              label="Exclude file names"
              tags={excludeFiles}
              onAdd={addExclude}
              onRemove={removeExclude}
              placeholder="package.json package-lock.json"
            />
          </div>
        </section>

        {showLog && (
          <section id="output" className={styles.section}>
            <div className={styles.sectionTitle}>
              <i className="ti ti-terminal" aria-hidden="true" /> Output
            </div>

            <div className={styles.statsRow}>
              <StatCard value={stats.files.toLocaleString()} label="Processed files" />
              <StatCard value={stats.chars.toLocaleString()} label="Processed chars" />
              <StatCard value={stats.tokens.toLocaleString()} label="Estimated tokens" />
              <StatCard value={stats.docs.toLocaleString()} label="Documents" />
            </div>

            <ExportLog entries={logEntries} progress={progress} totalFiles={includedCount} />
          </section>
        )}

        <div className={styles.actions}>
          <div className={styles.exportControls}>
            <label className={styles.exportLabel}>
              <span>Format</span>
              <select
                className={styles.exportSelect}
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                disabled={isRunning}
              >
                <option value="docx">DOCX</option>
                <option value="pdf">PDF</option>
                <option value="txt">TXT</option>
                <option value="md">Markdown (.md)</option>
              </select>
            </label>

            <button
              className={`${styles.btn} ${styles.btnPrimary} ${styles.exportBtn}`}
              onClick={handleExport}
              disabled={isRunning || includedCount === 0}
            >
              {isRunning
                ? 'Exporting…'
                : `Export ${includedCount > 0 ? `${includedCount} files` : exportFormat.toUpperCase()}`}
            </button>


            {files.length > 0 && (
              <>
                <button
                  className={`${styles.btn} ${styles.btnSmall}`}
                  onClick={handleRefresh}
                  disabled={isRunning}
                >
                  Refresh
                </button>
                <button
                  className={`${styles.btn} ${styles.resetBtn}`}
                  onClick={handleReset}
                  disabled={isRunning}
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}