import { useState, useCallback } from 'react'
import DropZone from './components/DropZone'
import FileList from './components/FileList'
import TagInput from './components/TagInput'
import ExportLog from './components/ExportLog'
import StatCard from './components/StatCard'
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  isFileIncluded,
  buildDocumentParts,
} from './lib/fileUtils'
import { buildDocxBlob, downloadBlob } from './lib/docxBuilder'
import styles from './App.module.css'

const STATUS = { IDLE: 'idle', RUNNING: 'running', DONE: 'done' }

export default function App() {
  const [files, setFiles] = useState([])
  const [includedExts, setIncludedExts] = useState(new Set(DEFAULT_EXTENSIONS))
  const [skipDirs, setSkipDirs] = useState(new Set(DEFAULT_SKIP_DIRS))
  const [maxWords, setMaxWords] = useState(1300)
  const [rootLabel, setRootLabel] = useState('project')

  const [status, setStatus] = useState(STATUS.IDLE)
  const [logEntries, setLogEntries] = useState([])
  const [progress, setProgress] = useState(0)
  const [stats, setStats] = useState({ files: 0, words: 0, docs: 0 })

  const addLog = useCallback((text, type = 'info') => {
    setLogEntries(prev => [...prev, { text, type }])
  }, [])

  const handleFiles = useCallback((incoming) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}::${f.size}`))
      return [...prev, ...incoming.filter(f => !existing.has(`${f.name}::${f.size}`))]
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
    setIncludedExts(prev => { const s = new Set(prev); s.delete(val); return s })
  }, [])

  const addSkip = useCallback((val) => {
    setSkipDirs(prev => new Set([...prev, val]))
  }, [])

  const removeSkip = useCallback((val) => {
    setSkipDirs(prev => { const s = new Set(prev); s.delete(val); return s })
  }, [])

  const includedCount = files.filter(f => isFileIncluded(f, includedExts, skipDirs)).length
  const isRunning = status === STATUS.RUNNING

  const handleExport = async () => {
    setStatus(STATUS.RUNNING)
    setLogEntries([])
    setProgress(0)
    setStats({ files: 0, words: 0, docs: 0 })

    const included = files.filter(f => isFileIncluded(f, includedExts, skipDirs))
    addLog(`Starting export — ${included.length} files, max ${maxWords.toLocaleString()} words/doc`)

    try {
      const parts = await buildDocumentParts(
        files, includedExts, skipDirs, rootLabel, maxWords,
        ({ processedFiles, totalFiles, totalWords, currentDocNum }) => {
          setProgress(processedFiles)
          setStats({ files: processedFiles, words: totalWords, docs: currentDocNum })
        }
      )

      setStats(s => ({ ...s, docs: parts.length }))
      addLog(`Processing complete — building ${parts.length} DOCX file(s)…`)

      for (const part of parts) {
        const fname = `${rootLabel}_part_${part.num}.docx`;
        addLog(`Building ${fname} (${part.wordCount.toLocaleString()} words, ${part.chunks.length} files)…`)
        const blob = await buildDocxBlob(part.chunks)
        downloadBlob(blob, fname)
        addLog(`Downloaded ${fname}`, 'ok')
        await new Promise(r => setTimeout(r, 350))
      }

      addLog(`Done! ${parts.length} file(s) exported successfully.`, 'ok')
      setStatus(STATUS.DONE)
    } catch (err) {
      addLog(`Export failed: ${err.message}`, 'err')
      setStatus(STATUS.IDLE)
    }
  }

  const handleReset = () => {
    setFiles([])
    setLogEntries([])
    setProgress(0)
    setStats({ files: 0, words: 0, docs: 0 })
    setStatus(STATUS.IDLE)
  }

  const showLog = logEntries.length > 0

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <i className="ti ti-file-export" aria-hidden="true" />
          <span>Shatter</span>
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
            Use folder upload to preserve directory structure
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Project → Shatter</h1>
          <p className={styles.subtitle}>
            Upload your project, configure chunking, and download split Word documents — ready to paste into any LLM context window.
          </p>
        </header>

        <section id="files" className={styles.section}>
          <h2 className={styles.sectionTitle}><i className="ti ti-folder-open" aria-hidden="true" /> Project files</h2>
          <DropZone onFiles={handleFiles} />
          <FileList files={files} includedExts={includedExts} skipDirs={skipDirs} onRemove={removeFile} />
        </section>

        <section id="config" className={styles.section}>
          <h2 className={styles.sectionTitle}><i className="ti ti-sliders" aria-hidden="true" /> Configuration</h2>
          <div className={styles.configGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="maxWords">Max words per document</label>
              <input id="maxWords" className={styles.fieldInput} type="number" value={maxWords} min={100} max={500000}
                onChange={e => setMaxWords(Math.max(100, parseInt(e.target.value) || 1300))} />
              <span className={styles.fieldHint}>Files split when this limit is reached</span>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="rootLabel">Root folder label</label>
              <input id="rootLabel" className={styles.fieldInput} type="text" value={rootLabel} maxLength={60}
                onChange={e => setRootLabel(e.target.value)} placeholder="project" />
              <span className={styles.fieldHint}>Top-level path prefix in output docs</span>
            </div>
          </div>
        </section>

        <section id="filters" className={styles.section}>
          <h2 className={styles.sectionTitle}><i className="ti ti-filter" aria-hidden="true" /> Filters</h2>
          <div className={styles.filterGrid}>
            <TagInput label="Included extensions" tags={includedExts} onAdd={addExt} onRemove={removeExt} placeholder=".ext" />
            <TagInput label="Skip directories" tags={skipDirs} onAdd={addSkip} onRemove={removeSkip} placeholder="folder name" />
          </div>
        </section>

        {showLog && (
          <section id="output" className={styles.section}>
            <h2 className={styles.sectionTitle}><i className="ti ti-terminal-2" aria-hidden="true" /> Output</h2>
            <div className={styles.statsRow}>
              <StatCard value={stats.files.toLocaleString()} label="Files processed" />
              <StatCard value={stats.words.toLocaleString()} label="Total words" />
              <StatCard value={stats.docs} label="Documents" />
            </div>
            <ExportLog
              entries={logEntries}
              progress={progress}
              totalFiles={files.filter(f => isFileIncluded(f, includedExts, skipDirs)).length}
            />
          </section>
        )}

        <div className={styles.actions}>
          <button className={styles.exportBtn} onClick={handleExport} disabled={includedCount === 0 || isRunning}>
            {isRunning
              ? <><i className="ti ti-loader-2" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} /> Exporting…</>
              : <><i className="ti ti-download" aria-hidden="true" /> Export {includedCount > 0 ? `${includedCount} files` : 'DOCX'}</>
            }
          </button>
          {files.length > 0 && (
            <button className={styles.resetBtn} onClick={handleReset} disabled={isRunning}>
              <i className="ti ti-trash" aria-hidden="true" /> Clear all
            </button>
          )}
        </div>
      </main>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
