import { Router, Request, Response } from 'express'
import { verifyBet, verifySeedHash } from '../lib/crypto'

const router = Router()

type GameType = 'dice' | 'crash' | 'limbo' | 'mines' | 'plinko'
const validGames: GameType[] = ['dice', 'crash', 'limbo', 'mines', 'plinko']

// POST /api/verify/bet
router.post('/bet', (req: Request, res: Response) => {
  const { serverSeed, clientSeed, nonce, game, currentRound } = req.body as {
    serverSeed?: string
    clientSeed?: string
    nonce?: number
    game?: string
    currentRound?: number
  }

  if (!serverSeed || !clientSeed || nonce === undefined || !game) {
    res.status(400).json({ error: 'Required: serverSeed, clientSeed, nonce, game' })
    return
  }

  if (!validGames.includes(game as GameType)) {
    res.status(400).json({ error: `game must be one of: ${validGames.join(', ')}` })
    return
  }

  try {
    const result = verifyBet(serverSeed, clientSeed, nonce, game as GameType, currentRound)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Verification failed', detail: String(err) })
  }
})

// POST /api/verify/hash
router.post('/hash', (req: Request, res: Response) => {
  const { serverSeed, claimedHash } = req.body as { serverSeed?: string; claimedHash?: string }
  if (!serverSeed || !claimedHash) {
    res.status(400).json({ error: 'Required: serverSeed, claimedHash' })
    return
  }
  res.json(verifySeedHash(serverSeed, claimedHash))
})

// POST /api/verify/batch
router.post('/batch', (req: Request, res: Response) => {
  const bets = req.body as unknown
  if (!Array.isArray(bets)) {
    res.status(400).json({ error: 'Expected array of bet objects' })
    return
  }

  const results = bets.map((bet: unknown, idx: number) => {
    const b = bet as Record<string, unknown>
    if (!b.serverSeed || !b.clientSeed || b.nonce === undefined || !b.game) {
      return { index: idx, error: 'Missing fields' }
    }
    if (!validGames.includes(b.game as GameType)) {
      return { index: idx, error: `Invalid game: ${b.game}` }
    }
    try {
      const res = verifyBet(
        b.serverSeed as string,
        b.clientSeed as string,
        b.nonce as number,
        b.game as GameType,
        b.currentRound as number | undefined
      )
      const claimedOutcome = b.outcome as number | undefined
      const computed = Array.isArray(res.outcome) ? res.outcome[0] : res.outcome
      const match = claimedOutcome !== undefined ? Math.abs(computed - claimedOutcome) < 0.01 : null
      return { index: idx, computed, claimed: claimedOutcome, match }
    } catch (err) {
      return { index: idx, error: String(err) }
    }
  })

  const matched = results.filter(r => 'match' in r && r.match === true).length
  const total = results.filter(r => 'match' in r && r.match !== null).length
  res.json({
    results,
    summary: {
      total_bets: bets.length,
      verified: total,
      matched,
      match_rate: total > 0 ? (matched / total) : null,
    },
  })
})

export default router
