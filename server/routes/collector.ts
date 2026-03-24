import { Router, Request, Response } from 'express'
import { collector } from '../lib/collector'

const router = Router()

// POST /api/collector/start
router.post('/start', (req: Request, res: Response) => {
  const { token, target, delayMs } = req.body as {
    token?: string
    target?: number
    delayMs?: number
  }

  if (!token) {
    res.status(400).json({ error: 'token is required' })
    return
  }
  if (!target || target < 1 || target > 10000) {
    res.status(400).json({ error: 'target must be between 1 and 10000' })
    return
  }

  const status = collector.getStatus()
  if (status.running) {
    res.status(409).json({ error: 'A collection job is already running', status })
    return
  }

  const delay = delayMs !== undefined ? Math.max(334, delayMs) : 700  // min ~3 req/sec

  // Fire-and-forget — job runs in background
  collector.start(token, target, delay).catch(err => {
    console.error('[collector] unhandled error:', err)
  })

  res.json({ started: true, target, delayMs: delay, status: collector.getStatus() })
})

// POST /api/collector/stop
router.post('/stop', (_req: Request, res: Response) => {
  collector.stop()
  res.json({ stopped: true, status: collector.getStatus() })
})

// GET /api/collector/status
router.get('/status', (_req: Request, res: Response) => {
  res.json(collector.getStatus())
})

// GET /api/collector/stream — Server-Sent Events
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Send current status immediately on connect
  send('status', collector.getStatus())

  const onProgress = (status: unknown) => send('progress', status)
  const onDone = (status: unknown) => { send('done', status); cleanup() }
  const onWarn = (msg: string) => send('warn', { message: msg })
  const onError = (msg: string) => send('error', { message: msg })
  const onStart = (status: unknown) => send('start', status)

  collector.on('progress', onProgress)
  collector.on('done', onDone)
  collector.on('warn', onWarn)
  collector.on('error', onError)
  collector.on('start', onStart)

  // Heartbeat every 5s to keep connection alive
  const heartbeat = setInterval(() => {
    send('heartbeat', collector.getStatus())
  }, 5000)

  const cleanup = () => {
    clearInterval(heartbeat)
    collector.off('progress', onProgress)
    collector.off('done', onDone)
    collector.off('warn', onWarn)
    collector.off('error', onError)
    collector.off('start', onStart)
  }

  req.on('close', cleanup)
})

export default router
