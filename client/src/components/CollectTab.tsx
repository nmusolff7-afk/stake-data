import React, { useState, useRef } from 'react'
import { SeedEntry, LogEntry } from '../types'
import { SeedTable } from './SeedTable'
import styles from './CollectTab.module.css'

const DEMO_SEEDS = [
  'a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2',
  'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
  'dead beef cafe babe 0000 1111 2222 3333 4444 5555 6666 7777 8888 9999'.replace(/ /g, ''),
  'f0e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7',
  '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
  'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aa',
  '9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba98',
  'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01',
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fe',
]

interface Props {
  seeds: SeedEntry[]
  onAddSeeds: (seeds: string[] | Partial<SeedEntry>[]) => Promise<{ added: number; duplicates: number; invalid: number }>
  onClearSeeds: () => Promise<void>
  onLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
}

export const CollectTab: React.FC<Props> = ({ seeds, onAddSeeds, onClearSeeds, onLog }) => {
  const [pasteValue, setPasteValue] = useState('')
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('stake_api_token') || '')
  const [queryType, setQueryType] = useState('seed_history')
  const [apiLoading, setApiLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleParse = async () => {
    const lines = pasteValue.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      onLog({ type: 'warn', message: 'No seeds to parse.' })
      return
    }
    try {
      const result = await onAddSeeds(lines)
      onLog({ type: 'success', message: `Added ${result.added} seeds. Duplicates: ${result.duplicates}. Invalid: ${result.invalid}.` })
      setPasteValue('')
    } catch {
      onLog({ type: 'error', message: 'Failed to add seeds.' })
    }
  }

  const handleDemo = async () => {
    const result = await onAddSeeds(DEMO_SEEDS)
    onLog({ type: 'info', message: `Loaded demo seeds. Added: ${result.added}, duplicates: ${result.duplicates}.` })
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(seeds, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'seeds.json'
    a.click()
    URL.revokeObjectURL(url)
    onLog({ type: 'success', message: `Exported ${seeds.length} seeds.` })
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text) as unknown
          const arr = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).seeds as unknown[]) || []
          const result = await onAddSeeds(arr as Partial<SeedEntry>[])
          onLog({ type: 'success', message: `Imported JSON: ${result.added} added, ${result.duplicates} duplicates.` })
        } else {
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
          const result = await onAddSeeds(lines)
          onLog({ type: 'success', message: `Imported text: ${result.added} added, ${result.duplicates} duplicates.` })
        }
      } catch {
        onLog({ type: 'error', message: 'Failed to parse import file.' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleApiQuery = async () => {
    if (!apiToken) {
      onLog({ type: 'error', message: 'Enter your Stake API token first.' })
      return
    }
    setApiLoading(true)
    onLog({ type: 'info', message: `Running ${queryType} query via proxy...` })
    try {
      const queriesRes = await fetch('/api/proxy/queries')
      const templates = await queriesRes.json() as Record<string, { query: string; variables?: Record<string, unknown> }>
      const template = templates[queryType]
      if (!template) throw new Error('Unknown query type')

      const res = await fetch('/api/proxy/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': apiToken,
        },
        body: JSON.stringify({ query: template.query, variables: template.variables }),
      })
      const data = await res.json() as Record<string, unknown>

      // Extract seeds from response
      const extracted: string[] = []
      const extractSeeds = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return
        if (Array.isArray(obj)) { obj.forEach(extractSeeds); return }
        const o = obj as Record<string, unknown>
        if (typeof o.seed === 'string' && /^[0-9a-f]{64}$/i.test(o.seed)) {
          extracted.push(o.seed)
        }
        Object.values(o).forEach(extractSeeds)
      }
      extractSeeds(data)

      if (extracted.length > 0) {
        const result = await onAddSeeds(extracted)
        onLog({ type: 'success', message: `API query complete. Extracted ${extracted.length} seeds. Added: ${result.added}, duplicates: ${result.duplicates}.` })
      } else {
        onLog({ type: 'warn', message: 'Query succeeded but no seeds found in response.' })
      }
    } catch (err) {
      onLog({ type: 'error', message: `API query failed: ${String(err)}` })
    } finally {
      setApiLoading(false)
    }
  }

  const handleTokenChange = (val: string) => {
    setApiToken(val)
    if (val) localStorage.setItem('stake_api_token', val)
    else localStorage.removeItem('stake_api_token')
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Paste Seeds</h3>
        <textarea
          className={styles.textarea}
          value={pasteValue}
          onChange={e => setPasteValue(e.target.value)}
          placeholder="Paste revealed server seeds here (one per line, 64-char hex)&#10;&#10;Example:&#10;a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2"
          rows={6}
        />
        <div className={styles.actions}>
          <button className={styles.btn} onClick={handleParse}>Parse &amp; Add</button>
          <button className={styles.btnSecondary} onClick={handleDemo}>Load 10 Demo Seeds</button>
          <button className={styles.btnSecondary} onClick={() => fileRef.current?.click()}>Import from File</button>
          <input ref={fileRef} type="file" accept=".json,.txt" style={{ display: 'none' }} onChange={handleImportFile} />
          <button className={styles.btnSecondary} onClick={handleExport} disabled={seeds.length === 0}>Export Seeds</button>
          <button className={styles.btnDanger} onClick={async () => { await onClearSeeds(); onLog({ type: 'warn', message: 'All seeds cleared.' }) }} disabled={seeds.length === 0}>Clear All</button>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Collect via Stake API</h3>
        <div className={styles.apiRow}>
          <input
            className={styles.input}
            type="password"
            placeholder="Your Stake x-access-token"
            value={apiToken}
            onChange={e => handleTokenChange(e.target.value)}
          />
          <select
            className={styles.select}
            value={queryType}
            onChange={e => setQueryType(e.target.value)}
          >
            <option value="seed_history">Seed History</option>
            <option value="bet_history">Bet History</option>
            <option value="current_seeds">Current Seeds</option>
          </select>
          <button className={styles.btn} onClick={handleApiQuery} disabled={apiLoading}>
            {apiLoading ? 'Running...' : 'Run Query'}
          </button>
        </div>
        <p className={styles.apiNote}>
          Token is stored in localStorage only and never sent to this server — all API calls go through the passthrough proxy.
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.corpusHeader}>
          <h3 className={styles.sectionTitle}>Seed Corpus</h3>
          <span className={styles.seedCount} data-has-seeds={seeds.length > 0}>{seeds.length} seeds</span>
        </div>
        <SeedTable seeds={seeds} />
      </div>
    </div>
  )
}
