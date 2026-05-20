import { useRef, useState } from 'react'
import styles from './DropZone.module.css'

// readEntries must be called in a loop — it returns at most ~100 entries per call.
async function readAllEntries(reader) {
  const all = []
  while (true) {
    const batch = await new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject)
    )
    if (!batch.length) break
    all.push(...batch)
  }
  return all
}

async function traverseEntry(entry, path, out) {
  if (entry.isFile) {
    await new Promise((resolve, reject) => {
      entry.file((file) => {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false,
          configurable: true,
        })
        out.push(file)
        resolve()
      }, reject)
    })
  } else if (entry.isDirectory) {
    const reader = entry.createReader()
    const entries = await readAllEntries(reader)
    for (const ent of entries) {
      await traverseEntry(ent, path + entry.name + '/', out)
    }
  }
}

export default function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)

    const items = [...(e.dataTransfer.items || [])]
    const files = []

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        await traverseEntry(entry, '', files)
      }
    }

    if (files.length) onFiles(files)
  }

  const handleChange = (e) => {
    const files = [...e.target.files]
    if (files.length) onFiles(files)
    e.target.value = ''
  }

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Upload project folder"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
        webkitdirectory=""
        mozdirectory=""
        directory=""
      />
      <div className={styles.icon}>
        <i className="ti ti-folder-upload" aria-hidden="true" />
      </div>
      <div className={styles.title}>
        {dragging ? 'Release to upload' : 'Drop your project folder here'}
      </div>
      <div className={styles.sub}>
        Click to browse — folder upload preserves directory structure
      </div>
    </div>
  )
}