import { useState, useCallback } from 'react'
import { SeedEntry, SeedStats } from '../types'

interface UseSeedsReturn {
  seeds: SeedEntry[]
  stats: SeedStats | null
  loading: boolean
  fetchSeeds: () => Promise<void>
  addSeeds: (seeds: string[] | Partial<SeedEntry>[]) => Promise<{ added: number; duplicates: number; invalid: number }>
  clearSeeds: () => Promise<void>
  refreshStats: () => Promise<void>
}

export function useSeeds(): UseSeedsReturn {
  const [seeds, setSeeds] = useState<SeedEntry[]>([])
  const [stats, setStats] = useState<SeedStats | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchSeeds = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seeds?limit=500')
      const data = await res.json() as { seeds: SeedEntry[] }
      setSeeds(data.seeds || [])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshStats = useCallback(async () => {
    const res = await fetch('/api/seeds/stats')
    const data = await res.json() as SeedStats
    setStats(data)
  }, [])

  const addSeeds = useCallback(async (rawSeeds: string[] | Partial<SeedEntry>[]) => {
    const res = await fetch('/api/seeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rawSeeds),
    })
    const data = await res.json() as { added: number; duplicates: number; invalid: number }
    await fetchSeeds()
    await refreshStats()
    return data
  }, [fetchSeeds, refreshStats])

  const clearSeeds = useCallback(async () => {
    await fetch('/api/seeds', { method: 'DELETE' })
    setSeeds([])
    setStats(null)
  }, [])

  return { seeds, stats, loading, fetchSeeds, addSeeds, clearSeeds, refreshStats }
}
