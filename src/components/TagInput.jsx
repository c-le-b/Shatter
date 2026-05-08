import { useState } from 'react'
import styles from './TagInput.module.css'

export default function TagInput({ label, tags, onAdd, onRemove, placeholder }) {
  const [input, setInput] = useState('')

  const handleAdd = () => {
    const val = input.trim()
    if (!val) return
    onAdd(val)
    setInput('')
  }

  return (
    <div className={styles.wrap}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.tags}>
        {[...tags].map(tag => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button className={styles.remove} onClick={() => onRemove(tag)} aria-label={`Remove ${tag}`}>
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          maxLength={40}
        />
        <button className={styles.addBtn} onClick={handleAdd}>
          <i className="ti ti-plus" aria-hidden="true" /> Add
        </button>
      </div>
    </div>
  )
}
