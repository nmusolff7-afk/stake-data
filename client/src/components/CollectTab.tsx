import React, { useState, useRef, useEffect, useCallback } from 'react'
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

const TARGET_PRESETS = [100, 500, 1000, 5000]

interface CollectorStatus {
  running: boolean
  collected: number
  errors: number
  rate: number
  eta: number | null
  target: number
  progress_pct: number
  latest_seed: string | null
  status: 'idle' | 'running' | 'complete' | 'error'
  error_message: string | null
}

interface Props {
  seeds: SeedEntry[]
  onAddSeeds: (seeds: string[] | Partial<SeedEntry>[]) => Promise<{ added: number; duplicates: number; invalid: number }>
  onClearSeeds: () => Promise<void>
  onLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
  onRefreshSeeds: () => Promise<void>
}

export const CollectTab: React.FC<Props> = ({ seeds, onAddSeeds, onClearSeeds, onLog, onRefreshSeeds }) => {
  const [pasteValue, setPasteValue] = useState('')
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('stake_api_token') || '')
  const [queryType, setQueryType] = useState('seed_history')
  const [apiLoading, setApiLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Automated collector state
  const [autoTarget, setAutoTarget] = useState<number>(100)
  const [customTarget, setCustomTarget] = useState('')
  const [useCustomTarget, setUseCustomTarget] = useState(false)
  const [delayMs, setDelayMs] = useState(700)
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatus>({
    running: false, collected: 0, errors: 0, rate: 0, eta: null,
    target: 0, progress_pct: 0, latest_seed: null, status: 'idle', error_message: null,
  })
  const sseRef = useRef<EventSource | null>(null)

  // Direct browser collection state
  interface DirectStatus {
    running: boolean
    collected: number
    errors: number
    latest_seed: string | null
    status: 'idle' | 'running' | 'complete' | 'error'
    error_message: string | null
  }
  const [directStatus, setDirectStatus] = useState<DirectStatus>({
    running: false, collected: 0, errors: 0,
    latest_seed: null, status: 'idle', error_message: null,
  })
  const stopDirectRef = useRef(false)
  const directTimestamps = useRef<number[]>([])

  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close()
    }
    const es = new EventSource('/api/collector/stream')

    const handleEvent = (e: MessageEvent) => {
      const data = JSON.parse(e.data) as CollectorStatus
      setCollectorStatus(data)
    }

    es.addEventListener('status', handleEvent)
    es.addEventListener('progress', handleEvent)
    es.addEventListener('heartbeat', handleEvent)
    es.addEventListener('start', handleEvent)
    es.addEventListener('done', (e: MessageEvent) => {
      const data = JSON.parse(e.data) as CollectorStatus
      setCollectorStatus(data)
      onRefreshSeeds()
      if (data.status === 'complete') {
        onLog({ type: 'success', message: `Collection complete. Collected ${data.collected} seeds.` })
      }
    })
    es.addEventListener('warn', (e: MessageEvent) => {
      const d = JSON.parse(e.data) as { message: string }
      onLog({ type: 'warn', message: d.message })
    })
    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { message: string }
        onLog({ type: 'error', message: `Collector error: ${d.message}` })
      } catch {
        // SSE connection error — reconnect
        setTimeout(connectSSE, 3000)
      }
    })

    es.onerror = () => {
      // Auto-reconnect on connection drop
      setTimeout(connectSSE, 3000)
    }

    sseRef.current = es
  }, [onLog, onRefreshSeeds])

  useEffect(() => {
    connectSSE()
    return () => { sseRef.current?.close() }
  }, [connectSSE])

  // Refresh seed list periodically while collector is running
  useEffect(() => {
    if (!collectorStatus.running) return
    const interval = setInterval(onRefreshSeeds, 5000)
    return () => clearInterval(interval)
  }, [collectorStatus.running, onRefreshSeeds])

  const handleParse = async () => {
    const lines = pasteValue.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) { onLog({ type: 'warn', message: 'No seeds to parse.' }); return }
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
    a.href = url; a.download = 'seeds.json'; a.click()
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
    if (!apiToken) { onLog({ type: 'error', message: 'Enter your Stake API token first.' }); return }
    setApiLoading(true)
    onLog({ type: 'info', message: `Running ${queryType} query via proxy...` })
    try {
      const queriesRes = await fetch('/api/proxy/queries')
      const templates = await queriesRes.json() as Record<string, { query: string; variables?: Record<string, unknown> }>
      const template = templates[queryType]
      if (!template) throw new Error('Unknown query type')
      const res = await fetch('/api/proxy/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': apiToken },
        body: JSON.stringify({ query: template.query, variables: template.variables }),
      })
      const data = await res.json() as Record<string, unknown>
      const extracted: string[] = []
      const extractSeeds = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return
        if (Array.isArray(obj)) { obj.forEach(extractSeeds); return }
        const o = obj as Record<string, unknown>
        if (typeof o.seed === 'string' && /^[0-9a-f]{64}$/i.test(o.seed)) extracted.push(o.seed)
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

  const handleStartCollector = async () => {
    if (!apiToken) { onLog({ type: 'error', message: 'Enter your Stake API token first.' }); return }
    const target = useCustomTarget ? parseInt(customTarget) : autoTarget
    if (!target || target < 1) { onLog({ type: 'error', message: 'Invalid target count.' }); return }

    try {
      const res = await fetch('/api/collector/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: apiToken, target, delayMs }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        onLog({ type: 'error', message: data.error || 'Failed to start collector.' })
        return
      }
      onLog({ type: 'info', message: `Automated collection started. Target: ${target} seeds @ ${(1000 / delayMs).toFixed(1)} req/s` })
    } catch (err) {
      onLog({ type: 'error', message: `Start failed: ${String(err)}` })
    }
  }

  const handleStopCollector = async () => {
    await fetch('/api/collector/stop', { method: 'POST' })
    onLog({ type: 'warn', message: 'Collection stopped by user.' })
    await onRefreshSeeds()
  }

  const reqPerSec = (1000 / delayMs).toFixed(1)
  const effectiveTarget = useCustomTarget ? (parseInt(customTarget) || 0) : autoTarget

  const DIRECT_MUTATION = `mutation RotateSeedPair($seed: String!) {
  rotateSeedPair(seed: $seed) {
    clientSeed {
      user {
        previousServerSeed { seed seedHash nonce }
        activeServerSeed { seedHash nonce }
      }
    }
  }
}`

  const handleStartDirect = async () => {
    const token = localStorage.getItem('stake_api_token') || apiToken
    if (!token) { onLog({ type: 'error', message: 'Enter your Stake API token first.' }); return }
    const target = effectiveTarget
    if (!target || target < 1) { onLog({ type: 'error', message: 'Set a target count first.' }); return }

    stopDirectRef.current = false
    directTimestamps.current = []
    let collected = 0
    let errors = 0
    let consecutiveErrors = 0

    setDirectStatus({ running: true, collected: 0, errors: 0, latest_seed: null, status: 'running', error_message: null })
    onLog({ type: 'info', message: `Direct browser collection started. Target: ${target} seeds.` })

    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

    while (!stopDirectRef.current && collected < target) {
      const loopStart = Date.now()
      const clientSeed = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

      try {
        const res = await fetch('https://stake.us/_api/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-access-token': token,
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
          },
          body: JSON.stringify({ query: DIRECT_MUTATION, variables: { seed: clientSeed } }),
        })

        if (res.status === 429) {
          onLog({ type: 'warn', message: 'Rate limited (429) — pausing 30s.' })
          setDirectStatus(s => ({ ...s, errors: ++errors }))
          await sleep(30000)
          continue
        }

        const data = await res.json() as {
          data?: { rotateSeedPair?: { clientSeed?: { user?: { previousServerSeed?: { seed?: string; seedHash?: string; nonce?: number } } } } }
          errors?: { message: string }[]
        }

        if (data.errors?.length) throw new Error(data.errors[0].message)

        const prev = data.data?.rotateSeedPair?.clientSeed?.user?.previousServerSeed
        const seed = prev?.seed

        if (seed && /^[0-9a-f]{64}$/i.test(seed)) {
          // Save to server
          await fetch('/api/seeds', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify([{ seed: seed.toLowerCase(), hash: prev?.seedHash, nonce: prev?.nonce, source: 'api' }]),
          })

          collected++
          consecutiveErrors = 0
          directTimestamps.current.push(Date.now())

          setDirectStatus(s => ({
            ...s,
            collected,
            errors,
            latest_seed: seed.toLowerCase(),
          }))

          if (collected % 10 === 0) {
            await onRefreshSeeds()
          }
        } else {
          errors++
          consecutiveErrors++
          setDirectStatus(s => ({ ...s, errors }))
        }

        if (consecutiveErrors >= 10) {
          throw new Error('10 consecutive errors — stopping.')
        }
      } catch (err) {
        errors++
        consecutiveErrors++
        const msg = String(err)
        setDirectStatus(s => ({ ...s, errors, error_message: msg }))
        if (consecutiveErrors >= 10) {
          onLog({ type: 'error', message: `Direct collection stopped: ${msg}` })
          setDirectStatus(s => ({ ...s, running: false, status: 'error' }))
          await onRefreshSeeds()
          return
        }
        await sleep(Math.min(1000 * consecutiveErrors, 30000))
        continue
      }

      const elapsed = Date.now() - loopStart
      const wait = Math.max(0, delayMs - elapsed)
      if (wait > 0) await sleep(wait)
    }

    setDirectStatus(s => ({
      ...s,
      running: false,
      status: stopDirectRef.current ? 'idle' : 'complete',
    }))
    await onRefreshSeeds()
    onLog({
      type: stopDirectRef.current ? 'warn' : 'success',
      message: stopDirectRef.current
        ? `Direct collection stopped. Collected ${collected} seeds.`
        : `Direct collection complete. Collected ${collected} seeds.`,
    })
  }

  const handleStopDirect = () => {
    stopDirectRef.current = true
    onLog({ type: 'warn', message: 'Direct collection stopping after current request...' })
  }

  // Compute live rate for direct collector
  const now = Date.now()
  const recentDirect = directTimestamps.current.filter(t => now - t < 10000)
  const directRate = (recentDirect.length / 10).toFixed(1)
  const directEta = directStatus.running && parseFloat(directRate) > 0
    ? Math.ceil((effectiveTarget - directStatus.collected) / parseFloat(directRate))
    : null
  const directEtaStr = directEta !== null ? (directEta < 60 ? `${directEta}s` : `${Math.ceil(directEta / 60)}m`) : '—'
  const directPct = effectiveTarget > 0 ? Math.min(100, Math.round((directStatus.collected / effectiveTarget) * 100)) : 0

  const directStatusColor: Record<DirectStatus['status'], string> = {
    idle: '#6e7681', running: '#e3b341', complete: '#58a6ff', error: '#f85149',
  }

  const etaStr = collectorStatus.eta !== null
    ? collectorStatus.eta < 60
      ? `${collectorStatus.eta}s`
      : `${Math.ceil(collectorStatus.eta / 60)}m`
    : '—'

  const statusColor: Record<CollectorStatus['status'], string> = {
    idle: '#6e7681',
    running: '#3fb950',
    complete: '#58a6ff',
    error: '#f85149',
  }

  return (
    <div className={styles.root}>
      {/* ── Paste Seeds ── */}
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

      {/* ── Manual API Query ── */}
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
          <select className={styles.select} value={queryType} onChange={e => setQueryType(e.target.value)}>
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

      {/* ── Automated Collection ── */}
      <div className={styles.section}>
        <div className={styles.autoHeader}>
          <h3 className={styles.sectionTitle}>Automated Collection</h3>
          <span className={styles.statusBadge} style={{ color: statusColor[collectorStatus.status], borderColor: statusColor[collectorStatus.status] + '44' }}>
            {collectorStatus.status.toUpperCase()}
          </span>
        </div>

        <div className={styles.autoConfig}>
          <div className={styles.configGroup}>
            <span className={styles.configLabel}>Target</span>
            <div className={styles.targetRow}>
              {TARGET_PRESETS.map(t => (
                <button
                  key={t}
                  className={styles.presetBtn}
                  data-active={!useCustomTarget && autoTarget === t}
                  onClick={() => { setAutoTarget(t); setUseCustomTarget(false) }}
                  disabled={collectorStatus.running}
                >
                  {t}
                </button>
              ))}
              <button
                className={styles.presetBtn}
                data-active={useCustomTarget}
                onClick={() => setUseCustomTarget(true)}
                disabled={collectorStatus.running}
              >
                Custom
              </button>
              {useCustomTarget && (
                <input
                  className={styles.customInput}
                  type="number"
                  min={1}
                  max={10000}
                  placeholder="e.g. 250"
                  value={customTarget}
                  onChange={e => setCustomTarget(e.target.value)}
                  disabled={collectorStatus.running}
                />
              )}
            </div>
          </div>

          <div className={styles.configGroup}>
            <span className={styles.configLabel}>Request rate: <strong>{reqPerSec} req/s</strong></span>
            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>slow</span>
              <input
                type="range"
                min={334}
                max={2000}
                step={50}
                value={delayMs}
                onChange={e => setDelayMs(parseInt(e.target.value))}
                disabled={collectorStatus.running}
                className={styles.slider}
              />
              <span className={styles.sliderLabel}>fast</span>
            </div>
            <span className={styles.sliderNote}>{delayMs}ms delay · hard cap 3 req/s</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className={styles.progressWrap}>
          <div
            className={styles.progressBar}
            style={{
              width: `${collectorStatus.progress_pct}%`,
              background: collectorStatus.status === 'error' ? '#f85149'
                : collectorStatus.status === 'complete' ? '#58a6ff' : '#3fb950',
            }}
          />
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Collected</span>
            <span className={styles.statValue} style={{ color: '#3fb950' }}>
              {collectorStatus.collected}{effectiveTarget > 0 ? ` / ${effectiveTarget}` : ''}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Errors</span>
            <span className={styles.statValue} style={{ color: collectorStatus.errors > 0 ? '#f85149' : '#6e7681' }}>
              {collectorStatus.errors}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Rate</span>
            <span className={styles.statValue}>{collectorStatus.rate}/s</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>ETA</span>
            <span className={styles.statValue}>{etaStr}</span>
          </div>
        </div>

        {/* Latest seed preview */}
        {collectorStatus.latest_seed && (
          <div className={styles.latestSeed}>
            <span className={styles.latestLabel}>Latest:</span>
            <code className={styles.latestValue}>{collectorStatus.latest_seed.slice(0, 16)}…</code>
          </div>
        )}

        {collectorStatus.error_message && (
          <div className={styles.errorMsg}>{collectorStatus.error_message}</div>
        )}

        <div className={styles.autoActions}>
          <button
            className={styles.btn}
            onClick={handleStartCollector}
            disabled={collectorStatus.running || !apiToken}
          >
            ▶ Start
          </button>
          <button
            className={styles.btnDanger}
            onClick={handleStopCollector}
            disabled={!collectorStatus.running}
          >
            ■ Stop
          </button>
          {!apiToken && (
            <span className={styles.tokenHint}>Enter API token in the section above first</span>
          )}
        </div>
      </div>

      {/* ── Direct Browser Collection ── */}
      <div className={styles.section}>
        <div className={styles.autoHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Direct Browser Collection</h3>
            <p className={styles.directNote}>
              Fetches directly from <code>stake.us/_api/graphql</code> — bypasses the server proxy entirely.
              Use this if the proxy route is blocked or rate-limited.
              Requires the app to be served from stake.us or CORS to allow it.
            </p>
          </div>
          <span className={styles.statusBadge} style={{ color: directStatusColor[directStatus.status], borderColor: directStatusColor[directStatus.status] + '44' }}>
            {directStatus.status.toUpperCase()}
          </span>
        </div>

        <div className={styles.progressWrap}>
          <div
            className={styles.progressBar}
            style={{
              width: `${directPct}%`,
              background: directStatus.status === 'error' ? '#f85149'
                : directStatus.status === 'complete' ? '#58a6ff' : '#e3b341',
            }}
          />
        </div>

        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Collected</span>
            <span className={styles.statValue} style={{ color: '#e3b341' }}>
              {directStatus.collected}{effectiveTarget > 0 ? ` / ${effectiveTarget}` : ''}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Errors</span>
            <span className={styles.statValue} style={{ color: directStatus.errors > 0 ? '#f85149' : '#6e7681' }}>
              {directStatus.errors}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Rate</span>
            <span className={styles.statValue}>{directRate}/s</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>ETA</span>
            <span className={styles.statValue}>{directEtaStr}</span>
          </div>
        </div>

        {directStatus.latest_seed && (
          <div className={styles.latestSeed}>
            <span className={styles.latestLabel}>Latest:</span>
            <code className={styles.latestValue}>{directStatus.latest_seed.slice(0, 16)}…</code>
          </div>
        )}

        {directStatus.error_message && (
          <div className={styles.errorMsg}>{directStatus.error_message}</div>
        )}

        <div className={styles.autoActions}>
          <button
            className={styles.btnYellow}
            onClick={handleStartDirect}
            disabled={directStatus.running || collectorStatus.running || !apiToken}
          >
            ▶ Direct Browser Collect
          </button>
          <button
            className={styles.btnDanger}
            onClick={handleStopDirect}
            disabled={!directStatus.running}
          >
            ■ Stop
          </button>
          {!apiToken && (
            <span className={styles.tokenHint}>Enter API token above first</span>
          )}
        </div>
      </div>

      {/* ── Seed Corpus ── */}
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
