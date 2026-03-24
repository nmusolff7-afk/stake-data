export interface SeedEntry {
  id: string
  seed: string
  hash?: string
  clientSeed?: string
  nonce?: number
  game?: string
  timestamp?: number
  rotatedAt?: string
  source: 'manual' | 'api' | 'import'
}

export interface TestResult {
  name: string
  description: string
  pass: boolean | null
  p_value?: number
  stat?: number
  detail?: Record<string, unknown>
  interpretation: string
  severity: 'pass' | 'warning' | 'critical' | 'inconclusive'
}

export interface AnalysisResult {
  timestamp: string
  seed_count: number
  duration_ms: number
  results: TestResult[]
}

export interface SeedStats {
  count: number
  oldest: number | null
  newest: number | null
  games: Record<string, number>
}

export interface LogEntry {
  id: string
  ts: string
  type: 'info' | 'success' | 'warn' | 'error'
  message: string
}

export interface VerifyBetResult {
  valid: boolean
  steps: {
    hmac_key: string
    hmac_message: string
    raw_buffer: string
    bytes: number[]
    uint32: number
    game_formula: string
    result: number
  }
  game: string
  outcome: number | number[]
}

export interface VerifyHashResult {
  match: boolean
  computed_hash: string
  claimed_hash: string
}
