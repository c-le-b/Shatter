import { formatBytes, isFileIncluded } from '../lib/fileUtils'
import styles from './FileList.module.css'

/**
 * Renders the list of all loaded files with included/skipped status.
 *
 * Props:
 *   files        - all loaded File objects
 *   includedExts - Set of extensions to include
 *   skipDirs     - Set of directory names to skip
 *   excludeFiles - Set of base filenames to exclude
 *   onRemove     - callback(index) to remove a file
 */
export default function FileList({ files, includedExts, skipDirs, excludeFiles, onRemove }) {
  if (files.length === 0) return null

  const included = files.filter(f => isFileIncluded(f, includedExts, skipDirs, excludeFiles))

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <span className={styles.countGood}>
          <i className="ti ti-check" aria-hidden="true" /> {included.length} included
        </span>
        <span className={styles.countSkip}>
          <i className="ti ti-minus" aria-hidden="true" /> {files.length - included.length} skipped
        </span>
        <span className={styles.total}>{files.length} total</span>
      </div>

      <div className={styles.list}>
        {files.map((file, idx) => {
          const inc = isFileIncluded(file, includedExts, skipDirs, excludeFiles)
          const path = file.webkitRelativePath || file.name

          return (
            <div
              key={`${file.name}-${file.size}-${idx}`}
              className={`${styles.row} ${inc ? '' : styles.skipped}`}
            >
              <i
                className={`ti ${inc ? 'ti-file-code' : 'ti-file-off'} ${styles.fileIcon}`}
                aria-hidden="true"
              />
              <span className={`${styles.path} selectable`} title={path}>
                {path}
              </span>
              <span className={styles.size}>{formatBytes(file.size)}</span>
              <button
                className={styles.removeBtn}
                onClick={() => onRemove(idx)}
                aria-label={`Remove ${file.name}`}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}