import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import { getSeedStats } from './lib/storage'
import seedsRouter from './routes/seeds'
import analysisRouter from './routes/analysis'
import verifyRouter from './routes/verify'
import proxyRouter from './routes/proxy'
import collectorRouter from './routes/collector'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)
const startTime = Date.now()

app.use(helmet({ contentSecurityPolicy: false }))

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))

// ── All /api routes MUST be registered before the static catch-all ──────────

app.use('/api/seeds', seedsRouter)
app.use('/api/analysis', analysisRouter)
app.use('/api/verify', verifyRouter)
app.use('/api/proxy', proxyRouter)
app.use('/api/collector', collectorRouter)

app.get('/api/health', (_req, res) => {
  const stats = getSeedStats()
  res.json({
    status: 'ok',
    seed_count: stats.count,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  })
})

// ── Static file serving — only AFTER all /api routes ────────────────────────

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    // Never intercept /api routes with the SPA fallback
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: `API route not found: ${req.path}` })
      return
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[server] Stake RNG Research Tool running on port ${PORT}`)
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV || 'development'}`)
})

export default app
