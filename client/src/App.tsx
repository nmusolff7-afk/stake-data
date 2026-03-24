import React, { useState, useEffect, useCallback } from 'react'
import { CollectTab } from './components/CollectTab'
import { AnalyzeTab } from './components/AnalyzeTab'
import { VisualizeTab } from './components/VisualizeTab'
import { ApiBuilderTab } from './components/ApiBuilderTab'
import { VerifyTab } from './components/VerifyTab'
import { ActivityLog } from './components/ActivityLog'
import { useSeeds } from './hooks/useSeeds'
import { useAnalysis } from './hooks/useAnalysis'
import { LogEntry } from './types'
import styles from './App.module.css'

type Tab = 'collect' | 'analyze' | 'visualize' | 'api' | 'verify'

let logIdCounter = 0
function makeLogEntry(entry: Omit<LogEntry, 'id' | 'ts'>): LogEntry {
  return {
    ...entry,
    id: String(++logIdCounter),
    ts: new Date().toLocaleTimeString(),
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('collect')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const { seeds, stats, fetchSeeds, addSeeds, clearSeeds, refreshStats } = useSeeds()
  const { result: analysisResult, loading: analysisLoading, error: analysisError, runAnalysis, fetchLatest } = useAnalysis()

  const log = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLogs(prev => [makeLogEntry(entry), ...prev])
  }, [])

  useEffect(() => {
    fetchSeeds()
    refreshStats()
    fetchLatest()
    log({ type: 'info', message: 'Stake RNG Research Tool initialized.' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const seedCount = stats?.count ?? seeds.length

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>STAKE RNG RESEARCH TOOL</span>
          <span className={styles.subtitle}>Statistical Analysis Platform</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.metaBadge} data-ok={seedCount > 0}>
            <span className={styles.metaLabel}>SEEDS</span>
            <span className={styles.metaValue}>{seedCount}</span>
          </div>
          {analysisResult && (
            <div className={styles.metaBadge} data-ok={true}>
              <span className={styles.metaLabel}>LAST ANALYSIS</span>
              <span className={styles.metaValue}>{new Date(analysisResult.timestamp).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.mainArea}>
          <nav className={styles.tabs}>
            {(['collect', 'analyze', 'visualize', 'api', 'verify'] as Tab[]).map(tab => (
              <button
                key={tab}
                className={styles.tab}
                data-active={tab === activeTab}
                onClick={() => setActiveTab(tab)}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {activeTab === 'collect' && (
              <CollectTab
                seeds={seeds}
                onAddSeeds={addSeeds}
                onClearSeeds={clearSeeds}
                onLog={log}
                onRefreshSeeds={fetchSeeds}
              />
            )}
            {activeTab === 'analyze' && (
              <AnalyzeTab
                result={analysisResult}
                loading={analysisLoading}
                error={analysisError}
                onRun={runAnalysis}
                seedCount={seedCount}
                onLog={log}
              />
            )}
            {activeTab === 'visualize' && (
              <VisualizeTab seeds={seeds} analysis={analysisResult} />
            )}
            {activeTab === 'api' && (
              <ApiBuilderTab onAddSeeds={addSeeds} onLog={log} />
            )}
            {activeTab === 'verify' && (
              <VerifyTab onLog={log} />
            )}
          </div>
        </div>

        <aside className={styles.sidebar}>
          <ActivityLog entries={logs} />
        </aside>
      </div>
    </div>
  )
}

export default App
