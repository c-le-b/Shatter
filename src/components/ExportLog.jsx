import { useEffect, useRef } from 'react'
import styles from './ExportLog.module.css'

const PREFIX = { ok: '✓', err: '✗', warn: '⚠', info: '·' }

/**
 * Scrolling log panel with a progress bar.
 *
 * Props:
 *   entries    - array of { text, type } log entries ('ok' | 'err' | 'warn' | 'info')
 *   progress   - number of files processed so far
 *   totalFiles - total number of files being processed
 */
export default function ExportLog({ entries, progress, totalFiles }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const pct = totalFiles > 0 ? Math.round((progress / totalFiles) * 100) : 0

  return (
    <div className={styles.wrap}>
      <div className={styles.progressRow}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.pct}>{pct}%</span>
      </div>

      <div className={`${styles.log} selectable`}>
        {entries.map((e, i) => (
          <div key={i} className={`${styles.line} ${styles[e.type] || ''}`}>
            <span className={styles.prefix}>{PREFIX[e.type] ?? '·'}</span>
            {e.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}