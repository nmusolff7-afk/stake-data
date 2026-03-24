import React, { useState } from 'react'
import { AnalysisResult, TestResult, LogEntry } from '../types'
import styles from './AnalyzeTab.module.css'

interface Props {
  result: AnalysisResult | null
  loading: boolean
  error: string | null
  onRun: () => Promise<AnalysisResult | null>
  seedCount: number
  onLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
}

function severityColor(s: TestResult['severity']): string {
  switch (s) {
    case 'pass': return '#3fb950'
    case 'warning': return '#e3b341'
    case 'critical': return '#f85149'
    case 'inconclusive': return '#6e7681'
  }
}

function pValueColor(p: number | undefined): string {
  if (p === undefined) return '#6e7681'
  if (p > 0.05) return '#3fb950'
  if (p > 0.01) return '#e3b341'
  return '#f85149'
}

const TestCard: React.FC<{ result: TestResult; index: number }> = ({ result }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={styles.card} data-severity={result.severity}>
      <div className={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
        <span className={styles.icon}>
          {result.pass === true ? '✓' : result.pass === false ? '✗' : '?'}
        </span>
        <div className={styles.cardInfo}>
          <span className={styles.testName}>{result.name}</span>
          <span className={styles.testDesc}>{result.description}</span>
        </div>
        <div className={styles.cardMeta}>
          {result.p_value !== undefined && (
            <span className={styles.pval} style={{ color: pValueColor(result.p_value) }}>
              p={result.p_value.toFixed(4)}
            </span>
          )}
          {result.stat !== undefined && (
            <span className={styles.stat}>stat={result.stat.toFixed(4)}</span>
          )}
          <span className={styles.badge} style={{ color: severityColor(result.severity), borderColor: severityColor(result.severity) + '44' }}>
            {result.severity}
          </span>
          <span className={styles.toggle}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      <div className={styles.interpretation}>{result.interpretation}</div>
      {expanded && result.detail && (
        <div className={styles.detail}>
          <pre>{JSON.stringify(result.detail, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export const AnalyzeTab: React.FC<Props> = ({ result, loading, error, onRun, seedCount, onLog }) => {
  const handleRun = async () => {
    if (seedCount === 0) {
      onLog({ type: 'error', message: 'Add seeds before running analysis.' })
      return
    }
    onLog({ type: 'info', message: 'Running full statistical test battery...' })
    const r = await onRun()
    if (r) {
      const critical = r.results.filter(t => t.severity === 'critical').length
      onLog({
        type: critical > 0 ? 'error' : 'success',
        message: `Analysis complete on ${r.seed_count} seeds in ${r.duration_ms}ms. ${critical} critical failures.`,
      })
    }
  }

  const summary = result
    ? {
        pass: result.results.filter(t => t.severity === 'pass').length,
        warning: result.results.filter(t => t.severity === 'warning').length,
        critical: result.results.filter(t => t.severity === 'critical').length,
        inconclusive: result.results.filter(t => t.severity === 'inconclusive').length,
      }
    : null

  const hasCritical = summary && summary.critical > 0

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button className={styles.runBtn} onClick={handleRun} disabled={loading || seedCount === 0}>
          {loading ? '⏳ Running...' : '▶ Run Full Analysis'}
        </button>
        {result && (
          <span className={styles.meta}>
            Ran at {new Date(result.timestamp).toLocaleTimeString()} · {result.seed_count} seeds · {result.duration_ms}ms
          </span>
        )}
      </div>

      {loading && (
        <div className={styles.progress}>
          <div className={styles.progressBar} />
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}

      {summary && (
        <div className={styles.summary}>
          <span style={{ color: '#3fb950' }}>✓ {summary.pass} passed</span>
          <span style={{ color: '#e3b341' }}>⚠ {summary.warning} warnings</span>
          <span style={{ color: '#f85149' }}>✗ {summary.critical} critical</span>
          <span style={{ color: '#6e7681' }}>? {summary.inconclusive} inconclusive</span>
        </div>
      )}

      {hasCritical && (
        <div className={styles.anomalyBanner}>
          ⚠ ANOMALY DETECTED — {summary!.critical} test(s) indicate non-random behavior
        </div>
      )}

      {result && (
        <div className={styles.cards}>
          {result.results.map((r, i) => (
            <TestCard key={r.name} result={r} index={i} />
          ))}
        </div>
      )}

      {result && (
        <div className={styles.interpretation}>
          <h4>Interpretation Guide</h4>
          <p>
            <strong style={{ color: '#f85149' }}>Critical failures</strong> suggest the seed generation algorithm deviates from cryptographic randomness.
            This could indicate use of Math.random(), a weak PRNG, or time-based seeding.
          </p>
          <p>
            <strong style={{ color: '#e3b341' }}>Warnings</strong> may indicate mild bias or insufficient sample size.
            Collect more seeds and re-run for reliable results.
          </p>
          <p>
            <strong style={{ color: '#3fb950' }}>All passing</strong> is the expected result for a properly implemented CSPRNG.
            Provably fair systems use HMAC-SHA256 which passes all these tests by design.
          </p>
        </div>
      )}

      {!result && !loading && (
        <div className={styles.empty}>
          {seedCount === 0
            ? 'Add seeds in the COLLECT tab first, then run analysis.'
            : 'Click "Run Full Analysis" to test this seed corpus for statistical randomness.'}
        </div>
      )}
    </div>
  )
}
