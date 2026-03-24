import { useState, useCallback } from 'react'
import { AnalysisResult } from '../types'

interface UseAnalysisReturn {
  result: AnalysisResult | null
  loading: boolean
  error: string | null
  runAnalysis: () => Promise<AnalysisResult | null>
  fetchLatest: () => Promise<void>
}

export function useAnalysis(): UseAnalysisReturn {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = useCallback(async (): Promise<AnalysisResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analysis/run', { method: 'POST' })
      if (!res.ok) {
        const errData = await res.json() as { error: string }
        throw new Error(errData.error)
      }
      const data = await res.json() as AnalysisResult
      setResult(data)
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch('/api/analysis/latest')
      if (res.ok) {
        const data = await res.json() as AnalysisResult
        setResult(data)
      }
    } catch {
      // no latest yet
    }
  }, [])

  return { result, loading, error, runAnalysis, fetchLatest }
}
