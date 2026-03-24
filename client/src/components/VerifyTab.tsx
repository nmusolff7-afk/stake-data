import React, { useState } from 'react'
import { VerifyBetResult, VerifyHashResult, LogEntry } from '../types'
import styles from './VerifyTab.module.css'

type GameType = 'dice' | 'crash' | 'limbo' | 'mines' | 'plinko'

interface Props {
  onLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
}

export const VerifyTab: React.FC<Props> = ({ onLog }) => {
  const [serverSeed, setServerSeed] = useState('')
  const [clientSeed, setClientSeed] = useState('')
  const [nonce, setNonce] = useState('')
  const [game, setGame] = useState<GameType>('dice')
  const [betResult, setBetResult] = useState<VerifyBetResult | null>(null)
  const [betLoading, setBetLoading] = useState(false)

  const [hashSeed, setHashSeed] = useState('')
  const [claimedHash, setClaimedHash] = useState('')
  const [hashResult, setHashResult] = useState<VerifyHashResult | null>(null)

  const [batchCsv, setBatchCsv] = useState('')
  const [batchResult, setBatchResult] = useState<{
    results: { index: number; computed?: number; claimed?: number; match: boolean | null; error?: string }[]
    summary: { total_bets: number; verified: number; matched: number; match_rate: number | null }
  } | null>(null)

  const handleVerifyBet = async () => {
    if (!serverSeed || !clientSeed || !nonce) {
      onLog({ type: 'error', message: 'Fill in all bet fields.' })
      return
    }
    setBetLoading(true)
    try {
      const res = await fetch('/api/verify/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverSeed, clientSeed, nonce: parseInt(nonce), game }),
      })
      const data = await res.json() as VerifyBetResult
      setBetResult(data)
      onLog({ type: 'success', message: `Bet verified. Outcome: ${JSON.stringify(data.outcome)}` })
    } catch {
      onLog({ type: 'error', message: 'Verification request failed.' })
    } finally {
      setBetLoading(false)
    }
  }

  const handleVerifyHash = async () => {
    if (!hashSeed || !claimedHash) {
      onLog({ type: 'error', message: 'Enter server seed and claimed hash.' })
      return
    }
    const res = await fetch('/api/verify/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverSeed: hashSeed, claimedHash }),
    })
    const data = await res.json() as VerifyHashResult
    setHashResult(data)
    onLog({ type: data.match ? 'success' : 'error', message: `Hash ${data.match ? 'MATCHES' : 'MISMATCH'}.` })
  }

  const handleBatch = async () => {
    const lines = batchCsv.trim().split('\n').filter(Boolean)
    const bets = lines.slice(1).map(line => {
      const [serverSeedB, clientSeedB, nonceB, gameB, outcome] = line.split(',').map(s => s.trim())
      return { serverSeed: serverSeedB, clientSeed: clientSeedB, nonce: parseInt(nonceB), game: gameB, outcome: parseFloat(outcome) }
    })
    if (bets.length === 0) {
      onLog({ type: 'warn', message: 'No valid bets in CSV.' })
      return
    }
    const res = await fetch('/api/verify/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bets),
    })
    const data = await res.json() as typeof batchResult
    setBatchResult(data)
    onLog({ type: 'success', message: `Batch complete. Match rate: ${data?.summary.match_rate !== null ? ((data?.summary.match_rate ?? 0) * 100).toFixed(1) + '%' : 'N/A'}` })
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Verify Bet Outcome</h3>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label>Server Seed</label>
            <input className={styles.input} value={serverSeed} onChange={e => setServerSeed(e.target.value)} placeholder="Revealed server seed (hex)" />
          </div>
          <div className={styles.field}>
            <label>Client Seed</label>
            <input className={styles.input} value={clientSeed} onChange={e => setClientSeed(e.target.value)} placeholder="Client seed" />
          </div>
          <div className={styles.field}>
            <label>Nonce</label>
            <input className={styles.input} value={nonce} onChange={e => setNonce(e.target.value)} placeholder="Nonce (integer)" type="number" />
          </div>
          <div className={styles.field}>
            <label>Game</label>
            <select className={styles.select} value={game} onChange={e => setGame(e.target.value as GameType)}>
              <option value="dice">Dice</option>
              <option value="crash">Crash</option>
              <option value="limbo">Limbo</option>
              <option value="mines">Mines</option>
              <option value="plinko">Plinko</option>
            </select>
          </div>
        </div>
        <button className={styles.btn} onClick={handleVerifyBet} disabled={betLoading}>
          {betLoading ? 'Verifying...' : 'Verify'}
        </button>

        {betResult && (
          <div className={styles.result}>
            <div className={styles.outcome}>
              {Array.isArray(betResult.outcome)
                ? `[${betResult.outcome.join(', ')}]`
                : betResult.outcome.toFixed(game === 'dice' ? 2 : 4)}
              <span className={styles.gameLabel}>{betResult.game}</span>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}><span>HMAC Key:</span> <code>{betResult.steps.hmac_key.slice(0, 32)}…</code></div>
              <div className={styles.step}><span>Message:</span> <code>{betResult.steps.hmac_message}</code></div>
              <div className={styles.step}><span>Buffer:</span> <code>{betResult.steps.raw_buffer.slice(0, 32)}…</code></div>
              <div className={styles.step}><span>Bytes[0..7]:</span> <code>[{betResult.steps.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}]</code></div>
              <div className={styles.step}><span>uint32:</span> <code>{betResult.steps.uint32} (0x{betResult.steps.uint32.toString(16)})</code></div>
              <div className={styles.step}><span>Formula:</span> <code>{betResult.steps.game_formula}</code></div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Verify Seed Hash</h3>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label>Server Seed (revealed)</label>
            <input className={styles.input} value={hashSeed} onChange={e => setHashSeed(e.target.value)} placeholder="64-char hex" />
          </div>
          <div className={styles.field}>
            <label>Claimed SHA256 Hash</label>
            <input className={styles.input} value={claimedHash} onChange={e => setClaimedHash(e.target.value)} placeholder="64-char hex" />
          </div>
        </div>
        <button className={styles.btn} onClick={handleVerifyHash}>Verify Hash</button>
        {hashResult && (
          <div className={styles.hashResult} data-match={hashResult.match}>
            <div className={styles.hashStatus}>{hashResult.match ? '✓ HASH MATCHES' : '✗ HASH MISMATCH'}</div>
            <div className={styles.hashDetail}>
              <div><span>Computed:</span> <code>{hashResult.computed_hash}</code></div>
              <div><span>Claimed:</span> <code>{hashResult.claimed_hash}</code></div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Batch Verify</h3>
        <p className={styles.batchNote}>
          Paste CSV with columns: serverSeed, clientSeed, nonce, game, outcome
        </p>
        <textarea
          className={styles.textarea}
          value={batchCsv}
          onChange={e => setBatchCsv(e.target.value)}
          placeholder="serverSeed,clientSeed,nonce,game,outcome&#10;abc123...,xyz...,1,dice,45.23"
          rows={5}
        />
        <button className={styles.btn} onClick={handleBatch}>Batch Verify</button>
        {batchResult && (
          <div className={styles.batchResult}>
            <div className={styles.batchSummary}>
              <span>Total: {batchResult.summary.total_bets}</span>
              <span>Verified: {batchResult.summary.verified}</span>
              <span style={{ color: '#3fb950' }}>Matched: {batchResult.summary.matched}</span>
              <span>Rate: {batchResult.summary.match_rate !== null ? (batchResult.summary.match_rate * 100).toFixed(1) + '%' : 'N/A'}</span>
            </div>
            <table className={styles.batchTable}>
              <thead>
                <tr><th>#</th><th>Computed</th><th>Claimed</th><th>Match</th></tr>
              </thead>
              <tbody>
                {batchResult.results.slice(0, 50).map(r => (
                  <tr key={r.index}>
                    <td>{r.index + 1}</td>
                    <td>{r.computed?.toFixed(4) ?? '—'}</td>
                    <td>{r.claimed?.toFixed(4) ?? '—'}</td>
                    <td style={{ color: r.match ? '#3fb950' : r.match === false ? '#f85149' : '#6e7681' }}>
                      {r.match === true ? '✓' : r.match === false ? '✗' : r.error || '?'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
