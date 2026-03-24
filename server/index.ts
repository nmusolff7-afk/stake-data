import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import { getSeedStats } from './lib/storage'
import seedsRouter from './routes/seeds'
import analysisRouter from './routes/analysis'
import verifyRouter from './routes/verify'
import proxyRouter from './routes/proxy'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)
const startTime = Date.now()

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // allow frontend to load assets
}))

// CORS for development
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))

// API routes
app.use('/api/seeds', seedsRouter)
app.use('/api/analysis', analysisRouter)
app.use('/api/verify', verifyRouter)
app.use('/api/proxy', proxyRouter)

// Health endpoint
app.get('/api/health', (_req, res) => {
  const stats = getSeedStats()
  res.json({
    status: 'ok',
    seed_count: stats.count,
    last_analysis: null, // updated by analysis route cache
    uptime: Math.floor((Date.now() - startTime) / 1000),
  })
})

// Serve React client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[server] Stake RNG Research Tool running on port ${PORT}`)
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV || 'development'}`)
})

export default app
