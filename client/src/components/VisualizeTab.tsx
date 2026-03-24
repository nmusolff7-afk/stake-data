import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  LineChart, Line, ScatterChart, Scatter, ResponsiveContainer,
  Cell,
} from 'recharts'
import { SeedEntry, AnalysisResult } from '../types'
import styles from './VisualizeTab.module.css'

interface Props {
  seeds: SeedEntry[]
  analysis: AnalysisResult | null
}

function seedToUint32(seed: string): number {
  return parseInt(seed.slice(0, 8), 16) >>> 0
}

function hexCharCounts(seeds: SeedEntry[]): { char: string; count: number; expected: number; deviation: number }[] {
  const hex = '0123456789abcdef'
  const counts: Record<string, number> = {}
  hex.split('').forEach(c => (counts[c] = 0))
  let total = 0
  for (const s of seeds) {
    for (const c of s.seed.toLowerCase()) {
      if (counts[c] !== undefined) { counts[c]++; total++ }
    }
  }
  const expected = total / 16
  const sigma = Math.sqrt(expected * (1 - 1 / 16))
  return hex.split('').map(c => ({
    char: c,
    count: counts[c],
    expected,
    deviation: sigma > 0 ? Math.abs(counts[c] - expected) / sigma : 0,
  }))
}

function firstByteBuckets(seeds: SeedEntry[]): { bucket: string; count: number; expected: number }[] {
  const buckets = new Array(16).fill(0)
  for (const s of seeds) {
    buckets[Math.floor(parseInt(s.seed.slice(0, 2), 16) / 16)]++
  }
  const expected = seeds.length / 16
  return buckets.map((count, i) => ({
    bucket: `${(i * 16).toString(16).padStart(2, '0')}-${((i + 1) * 16 - 1).toString(16).padStart(2, '0')}`,
    count,
    expected,
  }))
}

const ChartCard: React.FC<{ title: string; description: string; hint: string; children: React.ReactNode }> = ({
  title, description, hint, children,
}) => (
  <div className={styles.chartCard}>
    <div className={styles.chartHeader}>
      <div>
        <div className={styles.chartTitle}>{title}</div>
        <div className={styles.chartDesc}>{description}</div>
      </div>
      <div className={styles.hint} title={hint}>?</div>
    </div>
    <div className={styles.chartBody}>{children}</div>
    <div className={styles.hintText}>{hint}</div>
  </div>
)

const dark = {
  bg: '#080c10',
  grid: '#21262d',
  text: '#6e7681',
}

export const VisualizeTab: React.FC<Props> = ({ seeds, analysis }) => {
  if (seeds.length < 3) {
    return (
      <div className={styles.empty}>
        Add at least 3 seeds to see visualizations.
      </div>
    )
  }

  const hexData = hexCharCounts(seeds)
  const bucketData = firstByteBuckets(seeds)
  const trajectoryData = seeds.slice(0, 200).map((s, i) => ({
    i,
    v: seedToUint32(s.seed) % 100000,
  }))
  const scatterData = seeds.slice(0, 500).slice(0, -1).map((s, i) => ({
    x: seedToUint32(s.seed),
    y: seedToUint32(seeds[i + 1].seed),
  }))

  const acResult = analysis?.results.find(r => r.name === 'Autocorrelation Test')
  const acData = acResult?.detail
    ? (acResult.detail as { lags: { lag: number; r: number; significant: boolean }[]; threshold: number }).lags?.map(l => ({
        lag: l.lag,
        r: l.r,
        significant: l.significant,
      }))
    : null
  const acThreshold = acResult?.detail ? (acResult.detail as { threshold: number }).threshold : null

  // Inter-seed distances histogram
  const distances: number[] = []
  for (let i = 1; i < Math.min(seeds.length, 200); i++) {
    const a = BigInt('0x' + seeds[i - 1].seed)
    const b = BigInt('0x' + seeds[i].seed)
    const d = a > b ? a - b : b - a
    // normalize to 0..100 buckets
    const bucket = Number((d >> BigInt(248)) & BigInt(255)) // top byte as proxy
    distances.push(bucket)
  }
  const distBuckets = new Array(32).fill(0)
  for (const d of distances) distBuckets[Math.floor(d / 8)]++
  const distData = distBuckets.map((count, i) => ({ bucket: i, count }))

  const tooltipStyle = {
    backgroundColor: '#0d1117',
    border: '1px solid #21262d',
    color: '#e6edf3',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
  }

  return (
    <div className={styles.root}>
      <ChartCard
        title="Hex Character Distribution"
        description="Frequency of each hex character (0–f) across all seeds"
        hint="Random seeds should show uniform distribution. Red bars indicate >2σ deviation — a sign of biased output."
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hexData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark.grid} />
            <XAxis dataKey="char" tick={{ fill: dark.text, fontSize: 11 }} />
            <YAxis tick={{ fill: dark.text, fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine y={hexData[0]?.expected} stroke="#58a6ff" strokeDasharray="4 2" label={{ value: 'expected', fill: '#58a6ff', fontSize: 10 }} />
            <Bar dataKey="count">
              {hexData.map((entry, i) => (
                <Cell key={i} fill={entry.deviation > 2 ? '#f85149' : '#3fb950'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="First-Byte Bucket Distribution"
        description="Distribution of first byte of each seed across 16 equal-width buckets"
        hint="Each bucket should have ~equal count. Large deviations indicate non-uniform seeding — e.g., seeds concentrated in a specific range."
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bucketData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark.grid} />
            <XAxis dataKey="bucket" tick={{ fill: dark.text, fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
            <YAxis tick={{ fill: dark.text, fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine y={bucketData[0]?.expected} stroke="#58a6ff" strokeDasharray="4 2" />
            <Bar dataKey="count" fill="#58a6ff" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Seed Value Trajectory"
        description="Top 32 bits of each seed over time (mod 100,000)"
        hint="Should look like random noise — no trends, patterns, or periodicity. A diagonal or staircase pattern indicates sequential seeds."
      >
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trajectoryData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark.grid} />
            <XAxis dataKey="i" tick={{ fill: dark.text, fontSize: 11 }} label={{ value: 'index', fill: dark.text, fontSize: 10 }} />
            <YAxis tick={{ fill: dark.text, fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="linear" dataKey="v" stroke="#58a6ff" dot={false} strokeWidth={1} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Lag-1 Scatter Plot"
        description="seed[i] top 32 bits vs seed[i+1] top 32 bits"
        hint="Random scatter is good. A diagonal line or structured pattern indicates correlation — xorshift128+ produces a characteristic diagonal artifact."
      >
        <ResponsiveContainer width="100%" height={250}>
          <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark.grid} />
            <XAxis dataKey="x" name="seed[i]" tick={{ fill: dark.text, fontSize: 11 }} type="number" domain={[0, 4294967295]} />
            <YAxis dataKey="y" name="seed[i+1]" tick={{ fill: dark.text, fontSize: 11 }} type="number" domain={[0, 4294967295]} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#21262d' }} />
            <Scatter data={scatterData} fill="#58a6ff" opacity={0.4} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      {acData && (
        <ChartCard
          title="Autocorrelation Function"
          description="Pearson correlation between seed values at lags 1–10"
          hint="Bars within blue reference lines = no significant autocorrelation. Bars outside = periodic structure in the seed sequence."
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={acData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark.grid} />
              <XAxis dataKey="lag" tick={{ fill: dark.text, fontSize: 11 }} label={{ value: 'lag', fill: dark.text, fontSize: 10 }} />
              <YAxis tick={{ fill: dark.text, fontSize: 11 }} domain={[-1, 1]} />
              <Tooltip contentStyle={tooltipStyle} />
              {acThreshold && <ReferenceLine y={acThreshold} stroke="#58a6ff" strokeDasharray="4 2" />}
              {acThreshold && <ReferenceLine y={-acThreshold} stroke="#58a6ff" strokeDasharray="4 2" />}
              <Bar dataKey="r">
                {acData.map((entry, i) => (
                  <Cell key={i} fill={entry.significant ? '#f85149' : '#3fb950'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard
        title="Inter-Seed Distance Distribution"
        description="Distribution of BigInt distances between consecutive seeds (top-byte proxy)"
        hint="For random seeds, distances should be roughly exponentially distributed. A spike at 0 = repeated seeds. Uniform distribution = sequential counter."
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark.grid} />
            <XAxis dataKey="bucket" tick={{ fill: dark.text, fontSize: 11 }} />
            <YAxis tick={{ fill: dark.text, fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="#e3b341" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
