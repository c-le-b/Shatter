import styles from './StatCard.module.css'

/** A small metric tile showing a value and a label. */
export default function StatCard({ value, label }) {
  return (
    <div className={styles.card}>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  )
}