// Statistical test implementations — pure TypeScript, no external libraries
// All math implemented from scratch using standard numerical approximations

export interface TestResult {
  name: string
  description: string
  pass: boolean | null
  p_value?: number
  stat?: number
  detail?: Record<string, unknown>
  interpretation: string
  severity: 'pass' | 'warning' | 'critical' | 'inconclusive'
}

export interface SeedEntry {
  id: string
  seed: string
  hash?: string
  clientSeed?: string
  nonce?: number
  game?: string
  timestamp?: number
  rotatedAt?: string
  source: 'manual' | 'api' | 'import'
}

// ─── Math primitives ────────────────────────────────────────────────────────

function lnGamma(x: number): number {
  // Lanczos approximation
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  }
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i)
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

function regularizedGammaP(a: number, x: number): number {
  // Lower regularized incomplete gamma function P(a,x) via series expansion
  if (x < 0) return 0
  if (x === 0) return 0
  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a
    let term = 1 / a
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a))
  } else {
    // Continued fraction (upper)
    return 1 - regularizedGammaQ(a, x)
  }
}

function regularizedGammaQ(a: number, x: number): number {
  // Upper regularized incomplete gamma via continued fraction
  let b = x + 1 - a
  let c = 1e300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-10) break
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h
}

function chiSquaredPValue(chi2: number, df: number): number {
  // P(X > chi2) where X ~ chi2(df)
  return 1 - regularizedGammaP(df / 2, chi2 / 2)
}

function normalCDF(z: number): number {
  // Abramowitz and Stegun approximation
  const p = 0.2316419
  const b = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429]
  const t = 1 / (1 + p * Math.abs(z))
  const poly = b[0] * t + b[1] * t ** 2 + b[2] * t ** 3 + b[3] * t ** 4 + b[4] * t ** 5
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
  const cdf = 1 - phi * poly
  return z >= 0 ? cdf : 1 - cdf
}

function tCDF(t: number, df: number): number {
  // CDF of Student's t-distribution via regularized incomplete beta
  const x = df / (df + t * t)
  const ibeta = regularizedGammaP(df / 2, df / 2 * (1 - x)) // approximation via gamma
  const p = 1 - 0.5 * ibeta
  return t >= 0 ? p : 1 - p
}

// ─── Bit extraction ──────────────────────────────────────────────────────────

function seedToBits(seed: string): number[] {
  const bits: number[] = []
  for (const ch of seed) {
    const nibble = parseInt(ch, 16)
    for (let b = 3; b >= 0; b--) {
      bits.push((nibble >> b) & 1)
    }
  }
  return bits
}

function seedToUint32(seed: string): number {
  return parseInt(seed.slice(0, 8), 16) >>> 0
}

function seedToBigInt(seed: string): bigint {
  return BigInt('0x' + seed)
}

// ─── Test implementations ────────────────────────────────────────────────────

export function frequencyTest(seeds: string[]): TestResult {
  const name = 'Frequency (Monobit) Test'
  const description = 'NIST SP 800-22 Test 1. Tests whether the number of 1s and 0s are approximately equal.'

  if (seeds.length < 2) {
    return { name, description, pass: null, interpretation: 'Insufficient data', severity: 'inconclusive' }
  }

  let ones = 0
  let total = 0
  for (const seed of seeds) {
    const bits = seedToBits(seed)
    ones += bits.filter(b => b === 1).length
    total += bits.length
  }

  const zeros = total - ones
  const s_n = ones - zeros
  const s_obs = Math.abs(s_n) / Math.sqrt(total)
  const p_value = Math.exp(-s_obs * s_obs) // erfc approximation: 2*(1-normalCDF(s_obs*sqrt(2)))
  const erfc_p = 2 * (1 - normalCDF(s_obs * Math.SQRT2))

  const pass = erfc_p > 0.01
  return {
    name,
    description,
    pass,
    p_value: erfc_p,
    stat: s_obs,
    detail: { ones, zeros, total, proportion_ones: ones / total },
    interpretation: pass
      ? `Bit balance is uniform (${(ones / total * 100).toFixed(2)}% ones).`
      : `Bit imbalance detected: ${ones} ones vs ${zeros} zeros (${(ones / total * 100).toFixed(2)}% ones). Expected ~50%.`,
    severity: erfc_p > 0.05 ? 'pass' : erfc_p > 0.01 ? 'warning' : 'critical',
  }
}

export function runsTest(seeds: string[]): TestResult {
  const name = 'Runs Test'
  const description = 'NIST SP 800-22 Test 3. Checks for clustering or alternation of 0s and 1s.'

  if (seeds.length < 2) {
    return { name, description, pass: null, interpretation: 'Insufficient data', severity: 'inconclusive' }
  }

  const bits: number[] = []
  for (const seed of seeds) {
    bits.push(...seedToBits(seed))
  }

  const n = bits.length
  const ones = bits.filter(b => b === 1).length
  const pi = ones / n

  if (Math.abs(pi - 0.5) > 2 / Math.sqrt(n)) {
    return {
      name,
      description,
      pass: false,
      interpretation: 'Pre-condition failed: bit proportion too far from 0.5. Run frequency test first.',
      severity: 'critical',
    }
  }

  let runs = 1
  for (let i = 1; i < n; i++) {
    if (bits[i] !== bits[i - 1]) runs++
  }

  const expected = 2 * n * pi * (1 - pi)
  const variance = 2 * Math.sqrt(2 * n) * pi * (1 - pi)
  const z = (runs - expected) / variance
  const p_value = 2 * (1 - normalCDF(Math.abs(z)))

  const pass = p_value > 0.01
  return {
    name,
    description,
    pass,
    p_value,
    stat: z,
    detail: { runs, expected: Math.round(expected), n },
    interpretation: pass
      ? `Run count (${runs}) is consistent with random data.`
      : `Run count (${runs}) deviates from expected (${Math.round(expected)}). May indicate clustering or alternation.`,
    severity: p_value > 0.05 ? 'pass' : p_value > 0.01 ? 'warning' : 'critical',
  }
}

export function serialCorrelationTest(seeds: string[]): TestResult {
  const name = 'Serial Correlation Test'
  const description = 'Lag-1 Pearson correlation between consecutive seed values. Detects linear dependencies.'

  if (seeds.length < 10) {
    return { name, description, pass: null, interpretation: 'Need at least 10 seeds', severity: 'inconclusive' }
  }

  const values = seeds.map(seedToUint32)
  const n = values.length - 1
  const x = values.slice(0, n)
  const y = values.slice(1)

  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n

  let covXY = 0, varX = 0, varY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    covXY += dx * dy
    varX += dx * dx
    varY += dy * dy
  }

  const r = varX === 0 || varY === 0 ? 0 : covXY / Math.sqrt(varX * varY)
  const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r)
  const p_value = 2 * (1 - tCDF(Math.abs(t), n - 2))

  const pass = Math.abs(r) <= 0.15
  return {
    name,
    description,
    pass,
    p_value,
    stat: r,
    detail: { r, t, n },
    interpretation: pass
      ? `No significant linear correlation between consecutive seeds (r=${r.toFixed(4)}).`
      : `Correlation r=${r.toFixed(4)} exceeds threshold 0.15. Seeds may be linearly dependent.`,
    severity: Math.abs(r) <= 0.15 ? 'pass' : Math.abs(r) <= 0.3 ? 'warning' : 'critical',
  }
}

export function chiSquaredDistributionTest(seeds: string[]): TestResult {
  const name = 'Chi-Squared Distribution Test'
  const description = 'Tests if the first byte of each seed is uniformly distributed across 16 buckets.'

  if (seeds.length < 20) {
    return { name, description, pass: null, interpretation: 'Need at least 20 seeds', severity: 'inconclusive' }
  }

  const buckets = new Array(16).fill(0)
  for (const seed of seeds) {
    const byte = parseInt(seed.slice(0, 2), 16)
    buckets[Math.floor(byte / 16)]++
  }

  const expected = seeds.length / 16
  let chi2 = 0
  for (const count of buckets) {
    chi2 += (count - expected) ** 2 / expected
  }

  const p_value = chiSquaredPValue(chi2, 15)
  const pass = p_value > 0.01
  return {
    name,
    description,
    pass,
    p_value,
    stat: chi2,
    detail: { buckets, expected: Math.round(expected * 100) / 100 },
    interpretation: pass
      ? `First-byte distribution is uniform (χ²=${chi2.toFixed(2)}, df=15).`
      : `Non-uniform first-byte distribution detected (χ²=${chi2.toFixed(2)}, p=${p_value.toFixed(4)}).`,
    severity: p_value > 0.05 ? 'pass' : p_value > 0.01 ? 'warning' : 'critical',
  }
}

export function hexCharDistributionTest(seeds: string[]): TestResult {
  const name = 'Hex Character Distribution Test'
  const description = 'Counts frequency of each hex character (0-f) across all seed characters.'

  if (seeds.length < 5) {
    return { name, description, pass: null, interpretation: 'Need at least 5 seeds', severity: 'inconclusive' }
  }

  const counts: Record<string, number> = {}
  const hexChars = '0123456789abcdef'
  for (const c of hexChars) counts[c] = 0

  let total = 0
  for (const seed of seeds) {
    for (const c of seed.toLowerCase()) {
      if (hexChars.includes(c)) {
        counts[c]++
        total++
      }
    }
  }

  const expected = total / 16
  let chi2 = 0
  const perChar: Record<string, { count: number; expected: number; bias_pct: number }> = {}
  for (const c of hexChars) {
    chi2 += (counts[c] - expected) ** 2 / expected
    perChar[c] = {
      count: counts[c],
      expected: Math.round(expected * 100) / 100,
      bias_pct: ((counts[c] - expected) / expected) * 100,
    }
  }

  const p_value = chiSquaredPValue(chi2, 15)
  const pass = p_value > 0.01
  return {
    name,
    description,
    pass,
    p_value,
    stat: chi2,
    detail: { per_char: perChar, total },
    interpretation: pass
      ? 'Hex character frequency is uniform across all positions.'
      : `Hex character bias detected. Some characters appear significantly more/less than expected.`,
    severity: p_value > 0.05 ? 'pass' : p_value > 0.01 ? 'warning' : 'critical',
  }
}

export function positionalBiasTest(seeds: string[]): TestResult {
  const name = 'Positional Bias Test'
  const description = 'Tests hex character uniformity at each of the 64 seed positions. Detects Math.random() float-to-hex artifacts.'

  if (seeds.length < 30) {
    return { name, description, pass: null, interpretation: 'Need at least 30 seeds for meaningful positional analysis', severity: 'inconclusive' }
  }

  const anomalous: { position: number; p_value: number; chi2: number; dominant_chars: string }[] = []
  const allPositions: { position: number; p_value: number }[] = []

  for (let pos = 0; pos < 64; pos++) {
    const counts = new Array(16).fill(0)
    for (const seed of seeds) {
      if (seed.length > pos) {
        counts[parseInt(seed[pos], 16)]++
      }
    }
    const expected = seeds.length / 16
    let chi2 = 0
    for (const c of counts) chi2 += (c - expected) ** 2 / expected
    const p = chiSquaredPValue(chi2, 15)
    allPositions.push({ position: pos, p_value: p })
    if (p < 0.01) {
      const maxCount = Math.max(...counts)
      const dominantIdx = counts.indexOf(maxCount)
      anomalous.push({ position: pos, p_value: p, chi2, dominant_chars: dominantIdx.toString(16) })
    }
  }

  const pass = anomalous.length === 0
  return {
    name,
    description,
    pass,
    detail: { anomalous_positions: anomalous, all_positions: allPositions },
    interpretation: pass
      ? 'No positional bias detected. Each position shows uniform hex distribution.'
      : `${anomalous.length} position(s) show non-uniform distribution: positions ${anomalous.map(a => a.position).join(', ')}. This can indicate Math.random() or similar weak PRNG.`,
    severity: anomalous.length === 0 ? 'pass' : anomalous.length <= 3 ? 'warning' : 'critical',
  }
}

export function interSeedDistanceTest(seeds: string[]): TestResult {
  const name = 'Inter-Seed Distance Test'
  const description = 'Measures variation in BigInt distances between consecutive seeds. CV≈1 is random; CV≈0 suggests sequential counter.'

  if (seeds.length < 5) {
    return { name, description, pass: null, interpretation: 'Need at least 5 seeds', severity: 'inconclusive' }
  }

  const bigints = seeds.map(seedToBigInt)
  const distances: bigint[] = []
  for (let i = 1; i < bigints.length; i++) {
    const d = bigints[i] > bigints[i - 1] ? bigints[i] - bigints[i - 1] : bigints[i - 1] - bigints[i]
    distances.push(d)
  }

  // Convert to float for stats (normalize by 2^256)
  const maxVal = BigInt(2) ** BigInt(256)
  const normalized = distances.map(d => Number(d * BigInt(1e12) / maxVal) / 1e12)

  const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length
  const variance = normalized.reduce((a, b) => a + (b - mean) ** 2, 0) / normalized.length
  const stddev = Math.sqrt(variance)
  const cv = mean === 0 ? 0 : stddev / mean

  const pass = cv >= 0.3 && cv <= 2.5
  return {
    name,
    description,
    stat: cv,
    pass,
    detail: { cv, mean_normalized: mean, std_normalized: stddev, n_distances: distances.length },
    interpretation: pass
      ? `Inter-seed distance coefficient of variation (CV=${cv.toFixed(3)}) is in the expected random range [0.3, 2.5].`
      : cv < 0.3
        ? `CV=${cv.toFixed(3)} is very low — seeds may be sequential (counter-based). Expected random range: 0.3–2.5.`
        : `CV=${cv.toFixed(3)} is very high — unusual clustering or extreme outliers detected.`,
    severity: pass ? 'pass' : cv < 0.1 ? 'critical' : 'warning',
  }
}

export function timestampCorrelationTest(seeds: SeedEntry[]): TestResult {
  const name = 'Timestamp Correlation Test'
  const description = 'Pearson correlation between top 32 bits of seed and Unix timestamp. High correlation suggests time-seeded PRNG.'

  const withTs = seeds.filter(s => s.timestamp !== undefined)
  if (withTs.length < 10) {
    return { name, description, pass: null, interpretation: 'Need at least 10 seeds with timestamps', severity: 'inconclusive' }
  }

  const x = withTs.map(s => seedToUint32(s.seed))
  const y = withTs.map(s => (s.timestamp! % (2 ** 32)) >>> 0)
  const n = x.length

  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  let covXY = 0, varX = 0, varY = 0
  for (let i = 0; i < n; i++) {
    covXY += (x[i] - meanX) * (y[i] - meanY)
    varX += (x[i] - meanX) ** 2
    varY += (y[i] - meanY) ** 2
  }

  const r = varX === 0 || varY === 0 ? 0 : covXY / Math.sqrt(varX * varY)
  const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r)
  const p_value = 2 * (1 - tCDF(Math.abs(t), n - 2))

  const pass = Math.abs(r) <= 0.1
  return {
    name,
    description,
    pass,
    p_value,
    stat: r,
    detail: { r, t, n },
    interpretation: pass
      ? `No significant correlation with timestamps (r=${r.toFixed(4)}).`
      : `Seed values correlate with timestamps (r=${r.toFixed(4)}). May indicate time-based seed generation.`,
    severity: Math.abs(r) <= 0.1 ? 'pass' : Math.abs(r) <= 0.3 ? 'warning' : 'critical',
  }
}

export function entropyEstimate(seeds: string[]): TestResult {
  const name = 'Shannon Entropy Estimate'
  const description = 'Byte-level Shannon entropy of all seed data. Perfect randomness = 8.0 bits/byte.'

  if (seeds.length < 5) {
    return { name, description, pass: null, interpretation: 'Need at least 5 seeds', severity: 'inconclusive' }
  }

  const byteCounts = new Array(256).fill(0)
  let total = 0
  for (const seed of seeds) {
    for (let i = 0; i < seed.length - 1; i += 2) {
      byteCounts[parseInt(seed.slice(i, i + 2), 16)]++
      total++
    }
  }

  let entropy = 0
  for (const count of byteCounts) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }

  const pass = entropy >= 7.5
  return {
    name,
    description,
    pass,
    stat: entropy,
    detail: { entropy_bits_per_byte: entropy, total_bytes: total, max_possible: 8.0 },
    interpretation: pass
      ? `Shannon entropy is ${entropy.toFixed(4)} bits/byte (close to ideal 8.0).`
      : `Low entropy: ${entropy.toFixed(4)} bits/byte. A truly random source should approach 8.0.`,
    severity: entropy >= 7.9 ? 'pass' : entropy >= 7.5 ? 'warning' : 'critical',
  }
}

export function autocorrelationTest(seeds: string[], maxLag: number = 10): TestResult {
  const name = 'Autocorrelation Test'
  const description = `Computes autocorrelation at lags 1–${maxLag}. Significant spikes suggest periodic or structured output.`

  if (seeds.length < maxLag + 5) {
    return { name, description, pass: null, interpretation: `Need at least ${maxLag + 5} seeds`, severity: 'inconclusive' }
  }

  const values = seeds.map(seedToUint32)
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n

  const threshold = 2 / Math.sqrt(n)
  const results: { lag: number; r: number; significant: boolean }[] = []

  for (let lag = 1; lag <= maxLag; lag++) {
    let cov = 0
    for (let i = 0; i < n - lag; i++) {
      cov += (values[i] - mean) * (values[i + lag] - mean)
    }
    const r = variance === 0 ? 0 : cov / ((n - lag) * variance)
    results.push({ lag, r, significant: Math.abs(r) > threshold })
  }

  const significant = results.filter(r => r.significant)
  const pass = significant.length === 0
  return {
    name,
    description,
    pass,
    detail: { lags: results, threshold, n },
    interpretation: pass
      ? 'No significant autocorrelation detected at any lag.'
      : `Significant autocorrelation at lag(s): ${significant.map(r => r.lag).join(', ')}. This suggests periodic structure.`,
    severity: significant.length === 0 ? 'pass' : significant.length <= 2 ? 'warning' : 'critical',
  }
}

// ─── Battery runner ──────────────────────────────────────────────────────────

export function runFullBattery(seeds: SeedEntry[]): TestResult[] {
  const hexSeeds = seeds.map(s => s.seed)
  return [
    frequencyTest(hexSeeds),
    runsTest(hexSeeds),
    serialCorrelationTest(hexSeeds),
    chiSquaredDistributionTest(hexSeeds),
    hexCharDistributionTest(hexSeeds),
    positionalBiasTest(hexSeeds),
    interSeedDistanceTest(hexSeeds),
    timestampCorrelationTest(seeds),
    entropyEstimate(hexSeeds),
    autocorrelationTest(hexSeeds),
  ]
}
