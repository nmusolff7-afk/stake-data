import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

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

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const SEEDS_FILE = join(DATA_DIR, 'seeds.json')

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function loadSeeds(): SeedEntry[] {
  ensureDataDir()
  if (!existsSync(SEEDS_FILE)) return []
  try {
    const raw = readFileSync(SEEDS_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as SeedEntry[]
  } catch {
    return []
  }
}

export function saveSeeds(seeds: SeedEntry[]): void {
  ensureDataDir()
  writeFileSync(SEEDS_FILE, JSON.stringify(seeds, null, 2), 'utf-8')
}

export function addSeeds(
  newSeeds: Partial<SeedEntry>[]
): { added: number; duplicates: number } {
  const existing = loadSeeds()
  const existingSet = new Set(existing.map(s => s.seed))

  let added = 0
  let duplicates = 0

  for (const entry of newSeeds) {
    if (!entry.seed) continue
    if (existingSet.has(entry.seed)) {
      duplicates++
      continue
    }
    existing.push({
      id: entry.id || uuidv4(),
      seed: entry.seed,
      hash: entry.hash,
      clientSeed: entry.clientSeed,
      nonce: entry.nonce,
      game: entry.game,
      timestamp: entry.timestamp ?? Date.now(),
      rotatedAt: entry.rotatedAt,
      source: entry.source || 'manual',
    })
    existingSet.add(entry.seed)
    added++
  }

  if (added > 0) saveSeeds(existing)
  return { added, duplicates }
}

export function clearSeeds(): void {
  saveSeeds([])
}

export function getSeedStats(): {
  count: number
  oldest: number | null
  newest: number | null
  games: Record<string, number>
} {
  const seeds = loadSeeds()
  if (seeds.length === 0) {
    return { count: 0, oldest: null, newest: null, games: {} }
  }

  const timestamps = seeds.filter(s => s.timestamp).map(s => s.timestamp as number)
  const games: Record<string, number> = {}
  for (const s of seeds) {
    if (s.game) games[s.game] = (games[s.game] || 0) + 1
  }

  return {
    count: seeds.length,
    oldest: timestamps.length ? Math.min(...timestamps) : null,
    newest: timestamps.length ? Math.max(...timestamps) : null,
    games,
  }
}

export function isValidSeedHex(seed: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(seed)
}
