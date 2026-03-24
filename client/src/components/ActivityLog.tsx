import React, { useEffect, useRef } from 'react'
import { LogEntry } from '../types'
import styles from './ActivityLog.module.css'

interface Props {
  entries: LogEntry[]
}

const typeColors: Record<LogEntry['type'], string> = {
  info: '#58a6ff',
  success: '#3fb950',
  warn: '#e3b341',
  error: '#f85149',
}

const typePrefix: Record<LogEntry['type'], string> = {
  info: '[INFO]',
  success: '[OK]',
  warn: '[WARN]',
  error: '[ERR]',
}

export const ActivityLog: React.FC<Props> = ({ entries }) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // newest on top — no scroll needed
  }, [entries])

  return (
    <div className={styles.log}>
      <div className={styles.header}>ACTIVITY LOG</div>
      <div className={styles.entries} ref={bottomRef}>
        {entries.map(e => (
          <div key={e.id} className={styles.entry}>
            <span className={styles.ts}>{e.ts}</span>
            <span className={styles.type} style={{ color: typeColors[e.type] }}>
              {typePrefix[e.type]}
            </span>
            <span className={styles.msg}>{e.message}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className={styles.empty}>No activity yet.</div>
        )}
      </div>
    </div>
  )
}
