import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  loadSeeds,
  addSeeds,
  clearSeeds,
  getSeedStats,
  isValidSeedHex,
  SeedEntry,
} from '../lib/storage'

const router = Router()

// GET /api/seeds — list with pagination
router.get('/', (_req: Request, res: Response) => {
  const seeds = loadSeeds()
  const page = parseInt((_req.query.page as string) || '1')
  const limit = parseInt((_req.query.limit as string) || '100')
  const start = (page - 1) * limit
  const paginated = seeds.slice(start, start + limit)
  res.json({ seeds: paginated, total: seeds.length, page, limit })
})

// POST /api/seeds — add seeds
router.post('/', (req: Request, res: Response) => {
  const body = req.body as unknown
  if (!Array.isArray(body) && typeof body !== 'object') {
    res.status(400).json({ error: 'Expected array of seeds or object with seeds array' })
    return
  }

  const raw: unknown[] = Array.isArray(body) ? body : ((body as Record<string, unknown>).seeds as unknown[]) || []

  const entries: Partial<SeedEntry>[] = raw.map(item => {
    if (typeof item === 'string') {
      return { seed: item.toLowerCase(), source: 'manual' as const, id: uuidv4() }
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>
      return {
        id: (obj.id as string) || uuidv4(),
        seed: ((obj.seed as string) || '').toLowerCase(),
        hash: obj.hash as string | undefined,
        clientSeed: obj.clientSeed as string | undefined,
        nonce: obj.nonce as number | undefined,
        game: obj.game as string | undefined,
        timestamp: (obj.timestamp as number | undefined) ?? Date.now(),
        rotatedAt: obj.rotatedAt as string | undefined,
        source: (obj.source as 'manual' | 'api' | 'import') || 'manual',
      }
    }
    return {}
  })

  const valid = entries.filter(e => e.seed && isValidSeedHex(e.seed))
  const invalidCount = entries.length - valid.length
  const result = addSeeds(valid)
  res.json({ ...result, invalid: invalidCount })
})

// DELETE /api/seeds
router.delete('/', (_req: Request, res: Response) => {
  clearSeeds()
  res.json({ success: true })
})

// GET /api/seeds/stats
router.get('/stats', (_req: Request, res: Response) => {
  res.json(getSeedStats())
})

// POST /api/seeds/validate
router.post('/validate', (req: Request, res: Response) => {
  const raw = req.body as unknown
  const seeds: string[] = Array.isArray(raw) ? (raw as string[]) : []
  const valid = seeds.filter(s => typeof s === 'string' && isValidSeedHex(s))
  const invalid = seeds.filter(s => typeof s !== 'string' || !isValidSeedHex(s))
  res.json({ valid: valid.length, invalid: invalid.length, invalid_samples: invalid.slice(0, 5) })
})

export default router
