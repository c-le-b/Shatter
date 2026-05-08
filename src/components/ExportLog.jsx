import { useEffect, useRef } from 'react'
import styles from './ExportLog.module.css'

export default function ExportLog({ entries, progress, totalFiles }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [entries])
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
            <span className={styles.prefix}>{e.type === 'ok' ? '✓' : e.type === 'err' ? '✗' : e.type === 'warn' ? '⚠' : '·'}</span>
            {e.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
