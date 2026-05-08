import { useRef, useState } from 'react'
import styles from './DropZone.module.css'


async function traverseEntry(entry, path, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
        });
        out.push(file);
        resolve();
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      reader.readEntries(async (entries) => {
        for (const ent of entries) {
          await traverseEntry(ent, path + entry.name + '/', out);
        }
        resolve();
      });
    }
  });
}


export default function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);

    const items = [...e.dataTransfer.items];
    const files = [];

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        await traverseEntry(entry, '', files);
      }
    }

    if (files.length) onFiles(files);
  };


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
