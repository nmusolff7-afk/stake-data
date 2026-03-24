import { Router, Request, Response } from 'express'
import { loadSeeds } from '../lib/storage'
import { runFullBattery, TestResult, SeedEntry } from '../lib/stats'

const router = Router()

interface AnalysisCache {
  timestamp: string
  seed_count: number
  duration_ms: number
  results: TestResult[]
}

let lastAnalysis: AnalysisCache | null = null

// POST /api/analysis/run
router.post('/run', (_req: Request, res: Response) => {
  const seeds = loadSeeds()
  if (seeds.length === 0) {
    res.status(400).json({ error: 'No seeds in corpus. Add seeds first.' })
    return
  }

  const start = Date.now()
  const results = runFullBattery(seeds as SeedEntry[])
  const duration_ms = Date.now() - start

  lastAnalysis = {
    timestamp: new Date().toISOString(),
    seed_count: seeds.length,
    duration_ms,
    results,
  }

  res.json(lastAnalysis)
})

// POST /api/analysis/single
router.post('/single', (req: Request, res: Response) => {
  const { test } = req.body as { test?: string }
  if (!test) {
    res.status(400).json({ error: 'Provide test name in body: { test: "frequency" }' })
    return
  }

  const seeds = loadSeeds()
  if (seeds.length === 0) {
    res.status(400).json({ error: 'No seeds in corpus.' })
    return
  }

  const { importDynamic } = { importDynamic: null }
  void importDynamic

  const statsModule = require('../lib/stats') as Record<string, (seeds: unknown[]) => TestResult>
  const testMap: Record<string, string> = {
    frequency: 'frequencyTest',
    runs: 'runsTest',
    serial: 'serialCorrelationTest',
    chisquared: 'chiSquaredDistributionTest',
    hexdist: 'hexCharDistributionTest',
    positional: 'positionalBiasTest',
    distance: 'interSeedDistanceTest',
    timestamp: 'timestampCorrelationTest',
    entropy: 'entropyEstimate',
    autocorrelation: 'autocorrelationTest',
  }

  const fnName = testMap[test.toLowerCase()]
  if (!fnName || typeof statsModule[fnName] !== 'function') {
    res.status(400).json({ error: `Unknown test: ${test}`, available: Object.keys(testMap) })
    return
  }

  const start = Date.now()
  const result = statsModule[fnName](seeds)
  const duration_ms = Date.now() - start

  res.json({ result, duration_ms })
})

// GET /api/analysis/latest
router.get('/latest', (_req: Request, res: Response) => {
  if (!lastAnalysis) {
    res.status(404).json({ error: 'No analysis has been run yet.' })
    return
  }
  res.json(lastAnalysis)
})

export default router
