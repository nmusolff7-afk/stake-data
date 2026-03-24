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

const STAKE_HOST = process.env.STAKE_API_HOST || 'stake.us'
const STAKE_PATH = process.env.STAKE_API_PATH || '/_api/graphql'
const STAKE_API = `https://${STAKE_HOST}${STAKE_PATH}`

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
    description: 'Fetch revealed server seeds using seedHistory field',
    query: `query SeedHistory($limit: Int) {
  user {
    seedHistory(limit: $limit) {
      serverSeed
      serverSeedHash
      clientSeed
      nonce
      createdAt
    }
  }
}`,
    variables: { limit: 100 },
  },
  seed_history_alt: {
    name: 'Seed History (alt)',
    description: 'Fetch seeds via activeSeedPair + previousSeeds fields',
    query: `query SeedHistoryAlt($limit: Int) {
  user {
    activeSeedPair {
      serverSeedHash
      clientSeed
      nonce
    }
    previousSeeds(limit: $limit) {
      serverSeed
      serverSeedHash
      clientSeed
      nonce
      createdAt
    }
  }
}`,
    variables: { limit: 100 },
  },
  whoami: {
    name: 'Who Am I',
    description: 'Verify authentication — returns user name and email only',
    query: `query WhoAmI {
  user {
    name
    email
  }
}`,
  },
  current_seeds: {
    name: 'Current Seeds',
    description: 'Fetch current active seeds',
    query: `query CurrentSeeds {
  user {
    activeServerSeed { seed seedHash nonce }
    activeClientSeed { seed }
  }
}`,
  },
  rotate_and_collect: {
    name: 'Rotate & Collect',
    description: 'Rotate seed pair — extracts previousServerSeed as revealed seed',
    query: `mutation RotateSeedPair($seed: String!) {
  rotateSeedPair(seed: $seed) {
    clientSeed {
      user {
        activeServerSeed { seed seedHash nonce }
        previousServerSeed { seed seedHash nonce }
      }
    }
  }
}`,
    variables: { seed: '<your-client-seed>' },
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

  const queryPreview = typeof body.query === 'string'
    ? body.query.trim().slice(0, 80).replace(/\s+/g, ' ')
    : '(none)'
  console.log(`[proxy] ${new Date().toISOString()} POST /api/proxy/graphql — token: ${!!accessToken} — query: ${queryPreview}`)

  if (!accessToken) {
    res.status(401).json({ error: 'Missing x-access-token header. Provide your own Stake API token.' })
    return
  }

  if (!body.query) {
    res.status(400).json({ error: 'Missing GraphQL query in request body' })
    return
  }

  const payload = JSON.stringify(body)
  const options = {
    hostname: STAKE_HOST,
    path: STAKE_PATH,
    port: 443,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-access-token': accessToken,
      'User-Agent': 'StakeRNGResearchTool/1.0',
      'origin': `https://${STAKE_HOST}`,
      'referer': `https://${STAKE_HOST}/`,
      'accept': 'application/json',
    },
  }

  console.log(`[proxy] forwarding to ${STAKE_API} (token: ...${accessToken.slice(-4)}) body_bytes: ${Buffer.byteLength(payload)}`)

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
