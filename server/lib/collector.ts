import { EventEmitter } from 'events'
import https from 'https'
import { addSeeds } from './storage'

export interface CollectorStatus {
  running: boolean
  collected: number
  errors: number
  rate: number       // seeds/sec (rolling)
  eta: number | null // seconds remaining
  target: number
  progress_pct: number
  latest_seed: string | null
  status: 'idle' | 'running' | 'complete' | 'error'
  error_message: string | null
}

interface GraphQLResponse {
  data?: {
    rotateSeedPair?: {
      clientSeed?: {
        user?: {
          previousServerSeed?: { seed?: string; seedHash?: string; nonce?: number }
          activeServerSeed?: { seed?: string; seedHash?: string; nonce?: number }
        }
      }
    }
  }
  errors?: { message: string }[]
}

const ROTATE_MUTATION = `
mutation RotateSeedPair($seed: String!) {
  rotateSeedPair(seed: $seed) {
    clientSeed {
      user {
        activeServerSeed { seed seedHash nonce }
        previousServerSeed { seed seedHash nonce }
      }
    }
  }
}
`

const MAX_RATE = 3          // hard cap req/sec
const WRITE_EVERY = 10      // flush to disk every N seeds
const MAX_CONSECUTIVE_ERRORS = 10
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 60000
const RATE_429_PAUSE_MS = 60000
const ROLLING_WINDOW_MS = 10000

function makeClientSeed(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function graphqlRequest(token: string, clientSeed: string): Promise<GraphQLResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: ROTATE_MUTATION, variables: { seed: clientSeed } })
    const options: https.RequestOptions = {
      hostname: 'stake.us',
      path: '/_api/graphql',
      port: 443,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-access-token': token,
        'User-Agent': 'StakeRNGResearchTool/1.0',
        'origin': 'https://stake.us',
        'referer': 'https://stake.us/',
        'accept': 'application/json',
      },
    }

    const req = https.request(options, res => {
      if (res.statusCode === 429) {
        reject(new RateLimitError('429 Too Many Requests'))
        res.resume()
        return
      }
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data) as GraphQLResponse) }
        catch { reject(new Error(`Invalid JSON: ${data.slice(0, 100)}`)) }
      })
    })

    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')) })
    req.write(body)
    req.end()
  })
}

class RateLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RateLimitError' }
}

export class StakeCollector extends EventEmitter {
  private _running = false
  private _collected = 0
  private _errors = 0
  private _target = 0
  private _latestSeed: string | null = null
  private _status: CollectorStatus['status'] = 'idle'
  private _errorMessage: string | null = null
  private _stopRequested = false
  private _rateTimestamps: number[] = []
  private _buffer: { seed: string; hash?: string; clientSeed?: string; nonce?: number }[] = []
  private _consecutiveErrors = 0
  private _consecutive429 = 0

  getStatus(): CollectorStatus {
    const now = Date.now()
    const recent = this._rateTimestamps.filter(t => now - t < ROLLING_WINDOW_MS)
    const rate = recent.length / (ROLLING_WINDOW_MS / 1000)
    const remaining = this._target - this._collected
    const eta = rate > 0 && remaining > 0 ? Math.ceil(remaining / rate) : null

    return {
      running: this._running,
      collected: this._collected,
      errors: this._errors,
      rate: Math.round(rate * 10) / 10,
      eta,
      target: this._target,
      progress_pct: this._target > 0 ? Math.min(100, Math.round((this._collected / this._target) * 100)) : 0,
      latest_seed: this._latestSeed,
      status: this._status,
      error_message: this._errorMessage,
    }
  }

  async start(token: string, targetCount: number, delayMs = 700): Promise<void> {
    if (this._running) return

    // Enforce hard rate cap
    const minDelay = Math.max(delayMs, Math.ceil(1000 / MAX_RATE))

    this._running = true
    this._stopRequested = false
    this._collected = 0
    this._errors = 0
    this._target = targetCount
    this._status = 'running'
    this._errorMessage = null
    this._rateTimestamps = []
    this._buffer = []
    this._consecutiveErrors = 0
    this._consecutive429 = 0

    this.emit('start', this.getStatus())

    let backoff = BACKOFF_BASE_MS

    while (!this._stopRequested && this._collected < targetCount) {
      const loopStart = Date.now()

      try {
        const clientSeed = makeClientSeed()
        const response = await graphqlRequest(token, clientSeed)

        if (response.errors?.length) {
          throw new Error(response.errors[0].message)
        }

        const prev = response.data?.rotateSeedPair?.clientSeed?.user?.previousServerSeed
        const seed = prev?.seed

        if (seed && /^[0-9a-f]{64}$/i.test(seed)) {
          this._buffer.push({
            seed: seed.toLowerCase(),
            hash: prev?.seedHash,
            clientSeed: clientSeed,
            nonce: prev?.nonce,
          })
          this._collected++
          this._latestSeed = seed.toLowerCase()
          this._rateTimestamps.push(Date.now())
          // trim rolling window
          const cutoff = Date.now() - ROLLING_WINDOW_MS
          this._rateTimestamps = this._rateTimestamps.filter(t => t > cutoff)

          this._consecutiveErrors = 0
          this._consecutive429 = 0
          backoff = BACKOFF_BASE_MS

          // flush buffer to disk
          if (this._buffer.length >= WRITE_EVERY) {
            this._flushBuffer()
          }

          this.emit('progress', this.getStatus())
        } else {
          // response ok but no seed in payload — count as soft error
          this._errors++
          this._consecutiveErrors++
        }
      } catch (err) {
        this._errors++
        this._consecutiveErrors++

        if (err instanceof RateLimitError) {
          this._consecutive429++
          if (this._consecutive429 >= 3) {
            this.emit('warn', `3 consecutive 429s — pausing ${RATE_429_PAUSE_MS / 1000}s`)
            await this._sleep(RATE_429_PAUSE_MS)
            this._consecutive429 = 0
            continue
          }
        }

        if (this._consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this._status = 'error'
          this._errorMessage = `${MAX_CONSECUTIVE_ERRORS} consecutive errors. Last: ${String(err)}`
          this.emit('error', this._errorMessage)
          break
        }

        // exponential backoff
        await this._sleep(Math.min(backoff, BACKOFF_MAX_MS))
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS)
        continue
      }

      // rate-limit delay
      const elapsed = Date.now() - loopStart
      const wait = minDelay - elapsed
      if (wait > 0) await this._sleep(wait)
    }

    // flush remaining
    this._flushBuffer()
    this._running = false

    if (this._status !== 'error') {
      this._status = this._collected >= targetCount ? 'complete' : 'idle'
    }

    this.emit('done', this.getStatus())
  }

  stop(): void {
    this._stopRequested = true
  }

  private _flushBuffer(): void {
    if (this._buffer.length === 0) return
    try {
      addSeeds(this._buffer.map(b => ({
        seed: b.seed,
        hash: b.hash,
        clientSeed: b.clientSeed,
        nonce: b.nonce,
        source: 'api' as const,
        timestamp: Date.now(),
      })))
    } catch (err) {
      this.emit('warn', `Failed to flush buffer: ${String(err)}`)
    }
    this._buffer = []
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Singleton — one job at a time
export const collector = new StakeCollector()
