import React, { useState, useEffect } from 'react'
import { SeedEntry, LogEntry } from '../types'
import styles from './ApiBuilderTab.module.css'

interface QueryTemplate {
  name: string
  description: string
  query: string
  variables?: Record<string, unknown>
}

interface Props {
  onAddSeeds: (seeds: string[] | Partial<SeedEntry>[]) => Promise<{ added: number; duplicates: number; invalid: number }>
  onLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
}

const CODE_TABS = ['cURL', 'Python', 'JavaScript'] as const
type CodeTab = typeof CODE_TABS[number]

function buildCurl(query: QueryTemplate, token: string): string {
  return `curl -X POST https://api.stake.com/graphql \\
  -H "Content-Type: application/json" \\
  -H "x-access-token: ${token || 'YOUR_TOKEN'}" \\
  -d '${JSON.stringify({ query: query.query, variables: query.variables })}'`
}

function buildPython(query: QueryTemplate, token: string): string {
  return `import requests

url = "https://api.stake.com/graphql"
headers = {
    "Content-Type": "application/json",
    "x-access-token": "${token || 'YOUR_TOKEN'}"
}
payload = ${JSON.stringify({ query: query.query, variables: query.variables }, null, 4)}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print(data)`
}

function buildJs(query: QueryTemplate, token: string): string {
  return `const response = await fetch("https://api.stake.com/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-access-token": "${token || 'YOUR_TOKEN'}"
  },
  body: JSON.stringify(${JSON.stringify({ query: query.query, variables: query.variables }, null, 2)})
});
const data = await response.json();
console.log(data);`
}

const PYTHON_PIPELINE = `#!/usr/bin/env python3
"""
Stake RNG Research Tool — Batch Seed Collection Pipeline
Collects revealed server seeds from your account history.
Requires: requests
"""
import requests, json, time, hashlib

BASE = "http://localhost:3001"
STAKE = "https://api.stake.com/graphql"
TOKEN = input("Enter your Stake x-access-token: ")

SEED_HISTORY_QUERY = """
query SeedHistory($limit: Int) {
  user {
    serverSeeds(limit: $limit) {
      seed hash nonce createdAt rotatedAt
    }
  }
}
"""

def fetch_seeds(limit=500):
    r = requests.post(STAKE,
        json={"query": SEED_HISTORY_QUERY, "variables": {"limit": limit}},
        headers={"Content-Type": "application/json", "x-access-token": TOKEN})
    r.raise_for_status()
    data = r.json()
    return data.get("data", {}).get("user", {}).get("serverSeeds", [])

def verify_hash(seed, claimed_hash):
    return hashlib.sha256(seed.encode()).hexdigest() == claimed_hash

def import_to_tool(seeds):
    entries = [{"seed": s["seed"], "hash": s.get("hash"),
                "source": "import",
                "rotatedAt": s.get("rotatedAt")} for s in seeds
               if s.get("seed") and len(s["seed"]) == 64]
    r = requests.post(f"{BASE}/api/seeds", json=entries,
        headers={"Content-Type": "application/json"})
    return r.json()

print("Fetching seed history...")
seeds = fetch_seeds()
print(f"Fetched {len(seeds)} seeds")

verified = sum(1 for s in seeds if s.get("seed") and s.get("hash")
               and verify_hash(s["seed"], s["hash"]))
print(f"Hash verification: {verified}/{len(seeds)} passed")

result = import_to_tool(seeds)
print(f"Imported: {result}")
print("Done! Now run analysis in the ANALYZE tab.")
`

export const ApiBuilderTab: React.FC<Props> = ({ onAddSeeds, onLog }) => {
  const [templates, setTemplates] = useState<Record<string, QueryTemplate>>({})
  const [selectedKey, setSelectedKey] = useState<string>('seed_history')
  const [codeTab, setCodeTab] = useState<CodeTab>('cURL')
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('stake_api_token') || '')
  const [testing, setTesting] = useState(false)
  const [running, setRunning] = useState(false)
  const [pipelineOpen, setPipelineOpen] = useState(false)

  useEffect(() => {
    fetch('/api/proxy/queries')
      .then(r => r.json())
      .then((data: Record<string, QueryTemplate>) => {
        setTemplates(data)
      })
      .catch(() => {})
  }, [])

  const handleTokenChange = (val: string) => {
    setApiToken(val)
    if (val) localStorage.setItem('stake_api_token', val)
    else localStorage.removeItem('stake_api_token')
  }

  const handleTestConnection = async () => {
    if (!apiToken) { onLog({ type: 'error', message: 'Enter API token first.' }); return }
    setTesting(true)
    try {
      const res = await fetch('/api/proxy/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': apiToken },
        body: JSON.stringify({ query: '{ user { name } }' }),
      })
      const data = await res.json() as Record<string, unknown>
      if ((data as Record<string, unknown>).errors) {
        onLog({ type: 'warn', message: `Connection ok but errors: ${JSON.stringify((data as Record<string, unknown>).errors)}` })
      } else {
        onLog({ type: 'success', message: `Connection successful. Response: ${JSON.stringify(data).slice(0, 80)}` })
      }
    } catch (err) {
      onLog({ type: 'error', message: `Connection failed: ${String(err)}` })
    } finally {
      setTesting(false)
    }
  }

  const handleRunAndImport = async () => {
    if (!apiToken) { onLog({ type: 'error', message: 'Enter API token first.' }); return }
    const template = templates[selectedKey]
    if (!template) return
    setRunning(true)
    onLog({ type: 'info', message: `Running ${template.name}...` })
    try {
      const res = await fetch('/api/proxy/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': apiToken },
        body: JSON.stringify({ query: template.query, variables: template.variables }),
      })
      const data = await res.json() as Record<string, unknown>
      const extracted: string[] = []
      const walk = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return
        if (Array.isArray(obj)) { obj.forEach(walk); return }
        const o = obj as Record<string, unknown>
        if (typeof o.seed === 'string' && /^[0-9a-f]{64}$/i.test(o.seed)) extracted.push(o.seed)
        Object.values(o).forEach(walk)
      }
      walk(data)
      if (extracted.length > 0) {
        const r = await onAddSeeds(extracted)
        onLog({ type: 'success', message: `Imported ${extracted.length} seeds. Added: ${r.added}, dupes: ${r.duplicates}.` })
      } else {
        onLog({ type: 'warn', message: 'No seeds found in response.' })
      }
    } catch (err) {
      onLog({ type: 'error', message: `Run failed: ${String(err)}` })
    } finally {
      setRunning(false)
    }
  }

  const selected = templates[selectedKey]

  const getCode = () => {
    if (!selected) return ''
    switch (codeTab) {
      case 'cURL': return buildCurl(selected, apiToken)
      case 'Python': return buildPython(selected, apiToken)
      case 'JavaScript': return buildJs(selected, apiToken)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Queries</div>
          {Object.entries(templates).map(([key, t]) => (
            <button
              key={key}
              className={styles.queryBtn}
              data-active={key === selectedKey}
              onClick={() => setSelectedKey(key)}
            >
              <div className={styles.queryName}>{t.name}</div>
              <div className={styles.queryDesc}>{t.description}</div>
            </button>
          ))}
        </div>

        <div className={styles.main}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>GraphQL Query</div>
            {selected && (
              <pre className={styles.queryDisplay}>{selected.query}</pre>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.codeTabs}>
              {CODE_TABS.map(tab => (
                <button
                  key={tab}
                  className={styles.codeTab}
                  data-active={tab === codeTab}
                  onClick={() => setCodeTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <pre className={styles.codeBlock}>{getCode()}</pre>
          </div>

          <div className={styles.section}>
            <div className={styles.tokenRow}>
              <input
                className={styles.input}
                type="password"
                placeholder="x-access-token (stored in localStorage only)"
                value={apiToken}
                onChange={e => handleTokenChange(e.target.value)}
              />
              <button className={styles.btn} onClick={handleTestConnection} disabled={testing}>
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button className={styles.btnGreen} onClick={handleRunAndImport} disabled={running || !selected}>
                {running ? 'Running...' : 'Run & Import'}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <button className={styles.pipelineToggle} onClick={() => setPipelineOpen(o => !o)}>
              {pipelineOpen ? '▼' : '▶'} Python Batch Collection Script
            </button>
            {pipelineOpen && (
              <pre className={styles.codeBlock}>{PYTHON_PIPELINE}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
