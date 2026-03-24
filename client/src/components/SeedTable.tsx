import React from 'react'
import { SeedEntry } from '../types'
import styles from './SeedTable.module.css'

interface Props {
  seeds: SeedEntry[]
}

export const SeedTable: React.FC<Props> = ({ seeds }) => {
  if (seeds.length === 0) {
    return <div className={styles.empty}>No seeds in corpus. Paste seeds above to get started.</div>
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Seed (truncated)</th>
            <th>Source</th>
            <th>Game</th>
            <th>Timestamp</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {seeds.slice(0, 200).map((s, i) => (
            <tr key={s.id}>
              <td className={styles.index}>{i + 1}</td>
              <td className={styles.seed}>
                <span className={styles.seedFull} title={s.seed}>
                  {s.seed.slice(0, 16)}…{s.seed.slice(-8)}
                </span>
              </td>
              <td>
                <span className={styles.badge} data-source={s.source}>{s.source}</span>
              </td>
              <td className={styles.game}>{s.game || '—'}</td>
              <td className={styles.ts}>
                {s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '—'}
              </td>
              <td>
                {s.hash ? (
                  <span className={styles.hashOk} title={s.hash}>✓</span>
                ) : (
                  <span className={styles.hashNone}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {seeds.length > 200 && (
        <div className={styles.truncNote}>Showing first 200 of {seeds.length} seeds.</div>
      )}
    </div>
  )
}
