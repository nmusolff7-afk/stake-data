import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import https from 'https'

const router = Router()

const proxyLimiter = rateLimit({
  windowMs: 1000,
  max: 2,
  message: { error: 'Rate limit: max 2 GraphQL requests per second' },
  standardHeaders: true,
  legacyHeaders: false,
})

const STAKE_API = 'https://api.stake.com/graphql'

const QUERY_TEMPLATES: Record<string, { name: string; description: string; query: string; variables?: Record<string, unknown> }> = {
  bet_history: {
    name: 'Bet History',
    description: 'Fetch recent bet history for the authenticated user',
    query: `query BetHistory($limit: Int, $offset: Int) {
  user {
    bets(limit: $limit, offset: $offset) {
      id
      game
      amount
      outcome
      createdAt
      serverSeed { seed hash }
      clientSeed { seed }
      nonce
    }
  }
}`,
    variables: { limit: 50, offset: 0 },
  },
  seed_history: {
    name: 'Seed History',
    description: 'Fetch revealed server seeds for the authenticated user',
    query: `query SeedHistory($limit: Int) {
  user {
    serverSeeds(limit: $limit) {
      seed
      hash
      nonce
      createdAt
      rotatedAt
    }
  }
}`,
    variables: { limit: 100 },
  },
  current_seeds: {
    name: 'Current Seeds',
    description: 'Fetch current active seeds',
    query: `query CurrentSeeds {
  user {
    activeServerSeed { hash nonce }
    activeClientSeed { seed }
  }
}`,
  },
  rotate_seed: {
    name: 'Rotate Seed',
    description: 'Rotate to new server seed (mutation)',
    query: `mutation RotateSeed($clientSeed: String!) {
  rotateSeed(clientSeed: $clientSeed) {
    serverSeed { seed hash }
    clientSeed { seed }
    nonce
  }
}`,
    variables: { clientSeed: '<your-client-seed>' },
  },
  verify_bet: {
    name: 'Verify Bet',
    description: 'Fetch a specific bet for verification',
    query: `query VerifyBet($betId: String!) {
  bet(id: $betId) {
    id
    game
    outcome
    serverSeed { seed hash }
    clientSeed { seed }
    nonce
  }
}`,
    variables: { betId: '<bet-id>' },
  },
}

// GET /api/proxy/test — verify this route is reachable
router.get('/test', (_req: Request, res: Response) => {
  res.json({ status: 'proxy route reachable' })
})

// GET /api/proxy/queries
router.get('/queries', (_req: Request, res: Response) => {
  res.json(QUERY_TEMPLATES)
})

// POST /api/proxy/graphql
router.post('/graphql', proxyLimiter, (req: Request, res: Response) => {
  const accessToken = req.headers['x-access-token'] as string | undefined
  const body = req.body as Record<string, unknown>

  console.log(`[proxy] ${new Date().toISOString()} POST /api/proxy/graphql hit — token present: ${!!accessToken}`)

  if (!accessToken) {
    res.status(401).json({ error: 'Missing x-access-token header. Provide your own Stake API token.' })
    return
  }

  if (!body.query) {
    res.status(400).json({ error: 'Missing GraphQL query in request body' })
    return
  }

  const payload = JSON.stringify(body)
  const url = new URL(STAKE_API)

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-access-token': accessToken,
      'User-Agent': 'StakeRNGResearchTool/1.0',
    },
  }

  console.log(`[proxy] forwarding to ${STAKE_API} (token: ...${accessToken.slice(-4)})`)

  let responded = false

  const proxyReq = https.request(options, proxyRes => {
    let data = ''
    proxyRes.on('data', chunk => { data += chunk })
    proxyRes.on('end', () => {
      if (responded) return
      responded = true
      console.log(`[proxy] upstream responded ${proxyRes.statusCode}, body length ${data.length}`)
      // Always return JSON — if upstream sends non-JSON, wrap it
      try {
        JSON.parse(data) // validate it's parseable
        res.status(proxyRes.statusCode || 200).set('Content-Type', 'application/json').send(data)
      } catch {
        res.status(proxyRes.statusCode || 502).json({
          error: 'Upstream returned non-JSON response',
          status: proxyRes.statusCode,
          body: data.slice(0, 500),
        })
      }
    })
  })

  proxyReq.on('error', err => {
    if (responded) return
    responded = true
    console.error('[proxy] upstream error:', err.message)
    res.status(502).json({ error: 'Upstream request failed', detail: err.message })
  })

  proxyReq.setTimeout(15000, () => {
    if (responded) return
    responded = true
    proxyReq.destroy()
    res.status(504).json({ error: 'Upstream request timed out after 15s' })
  })

  proxyReq.write(payload)
  proxyReq.end()
})

export default router
