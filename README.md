# Stake RNG Research Tool

A statistical analysis platform for studying provably fair gambling algorithms using only publicly available data (your own account's revealed server seeds).

## What This Tool Does

This tool lets you:
1. **Collect** revealed server seeds from your Stake account via API or manual paste
2. **Analyze** the seed corpus with 10 NIST-inspired statistical tests
3. **Visualize** seed distributions with interactive charts
4. **Verify** individual bet outcomes using Stake's HMAC-SHA256 algorithm
5. **Build API queries** for systematic seed collection

All statistical tests are implemented from scratch in TypeScript — no external math libraries.

## Why This Is Legitimate Security Research

- Only uses **revealed** server seeds (the platform publishes these after each game)
- All data is from **your own account** — no scraping or unauthorized access
- The GraphQL API proxy is a **pass-through only** — tokens are never stored server-side
- The verification algorithm is **publicly documented** by Stake as part of their provably fair system
- Statistical analysis of CSPRNG output is a standard academic and security research practice

## Deploy to Railway

### Prerequisites
- [Railway account](https://railway.app)
- [Railway CLI](https://docs.railway.app/develop/cli) (`npm i -g @railway/cli`)

### Steps

1. **Clone and push to GitHub** (or use Railway's GitHub integration)

2. **Create a new Railway project**:
   ```bash
   railway login
   railway init
   ```

3. **Add a volume** for seed persistence:
   - In Railway dashboard → your service → Volumes
   - Mount path: `/data`
   - This persists seeds across deploys

4. **Set environment variables** (optional):
   ```
   PORT=3000
   NODE_ENV=production
   DATA_DIR=/data
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

6. **Access** at the Railway-provided URL.

### Without a Volume

Seeds persist in the container filesystem but will be lost on redeploy. For production use, always mount a volume at `/data`.

## Getting Your Stake API Token

1. Log in to [Stake.com](https://stake.com)
2. Open DevTools → Network tab
3. Make any request (e.g., navigate to a game)
4. Find a GraphQL request to `api.stake.com/graphql`
5. Copy the `x-access-token` header value

**Note:** This token gives full account access. Never share it. The tool stores it in your browser's localStorage only.

## Interpreting Statistical Test Results

### Frequency (Monobit) Test
Tests if 0s and 1s are equally distributed across all seed bits. A CSPRNG should produce ~50% ones. Failure suggests output bias.

### Runs Test
Checks for clustering or alternation of bits. Too few runs = clustering; too many = alternation. Both indicate non-random structure.

### Serial Correlation (Lag-1)
Measures linear correlation between consecutive seeds. |r| > 0.15 suggests seeds are not independent — each seed can partially predict the next.

### Chi-Squared Distribution
Tests first-byte uniformity. A biased first byte suggests the generation process doesn't fully randomize all bits.

### Hex Character Distribution
Counts all 16 hex characters. Bias toward certain characters indicates incomplete bit mixing — common in Math.random()-based systems.

### Positional Bias Test
Most sensitive test. Checks each of 64 positions independently. Math.random() in V8 (xorshift128+) leaves a characteristic pattern: positions 13-15 are biased toward low hex values (0-3) due to float-to-hex conversion artifacts.

### Inter-Seed Distance
Measures how far apart consecutive seeds are in the 256-bit integer space. CV ≈ 1.0 is expected for random data. CV ≈ 0 means seeds are nearly sequential (counter-based PRNG).

### Timestamp Correlation
If seeds correlate with their collection timestamps, the PRNG may be time-seeded — predictable if the attacker knows the approximate time.

### Shannon Entropy
Should be ~8.0 bits/byte for truly random data. Values below 7.5 indicate structural patterns in the seed bytes.

### Autocorrelation
Checks for periodic patterns at lags 1–10. Significant autocorrelation at any lag suggests the RNG output has memory.

## Statistical Significance Thresholds

| p-value | Severity | Interpretation |
|---------|----------|----------------|
| > 0.05  | Pass (green) | No evidence of non-randomness |
| 0.01–0.05 | Warning (yellow) | Weak evidence, collect more seeds |
| < 0.01 | Critical (red) | Strong evidence of non-randomness |

A single test failing is not conclusive. Multiple failures, especially the positional bias test, are strong evidence of a weak PRNG.

## Local Development

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Architecture

```
client/ (React + Vite)     →  /api/*  →  server/ (Express)
                                            ├── /api/seeds       — corpus CRUD
                                            ├── /api/analysis    — statistical tests
                                            ├── /api/verify      — HMAC verification
                                            └── /api/proxy       — Stake API passthrough
                                                  ↓
                                            data/seeds.json      — file-based storage
```

## Legal & Ethical Context

This tool is designed for use with your own Stake account's data only. The provably fair system is specifically designed to allow players to verify game outcomes — this tool extends that verification to statistical analysis. All API access uses your own credentials. No automated gambling, no account manipulation, no access to other users' data.
