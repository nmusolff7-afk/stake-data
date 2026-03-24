import { createHmac, createHash, randomBytes } from 'crypto'

export interface VerifyBetResult {
  valid: boolean
  steps: {
    hmac_key: string
    hmac_message: string
    raw_buffer: string
    bytes: number[]
    uint32: number
    game_formula: string
    result: number
  }
  game: string
  outcome: number | number[]
}

export interface VerifyHashResult {
  match: boolean
  computed_hash: string
  claimed_hash: string
}

type GameType = 'dice' | 'crash' | 'limbo' | 'mines' | 'plinko'

function bytesToUint32(bytes: number[], offset = 0): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>> 0
  )
}

function uint32ToFloat(uint32: number): number {
  return uint32 / 0x100000000
}

export function verifyBet(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  game: GameType,
  currentRound = 1
): VerifyBetResult {
  const hmacKey = serverSeed
  const hmacMessage = `${clientSeed}:${nonce}:${currentRound}`

  const hmac = createHmac('sha256', hmacKey)
  hmac.update(hmacMessage)
  const buffer = hmac.digest()

  const rawBufferHex = buffer.toString('hex')
  const bytes = Array.from(buffer)
  const uint32 = bytesToUint32(bytes, 0)

  let outcome: number | number[]
  let formula: string

  switch (game) {
    case 'dice': {
      outcome = Math.floor((uint32 / 0xffffffff) * 10001) / 100
      formula = `floor(uint32 / 0xFFFFFFFF × 10001) / 100 = ${outcome}`
      break
    }
    case 'crash':
    case 'limbo': {
      const raw = (2 ** 32 / (uint32 + 1)) * (1 - 0.01)
      outcome = Math.max(1, raw)
      formula = `max(1, (2^32 / (uint32 + 1)) × 0.99) = ${outcome.toFixed(2)}x`
      break
    }
    case 'mines': {
      // Generate mine positions from multiple 4-byte chunks
      const mines: number[] = []
      const usedPositions = new Set<number>()
      let byteOffset = 0
      while (mines.length < 5 && byteOffset + 4 <= bytes.length) {
        const val = bytesToUint32(bytes, byteOffset % (bytes.length - 3))
        const pos = val % 25
        if (!usedPositions.has(pos)) {
          mines.push(pos)
          usedPositions.add(pos)
        }
        byteOffset += 4
        if (byteOffset >= bytes.length) break
      }
      outcome = mines
      formula = `Mine positions derived from successive uint32 values mod 25`
      break
    }
    case 'plinko': {
      // 8 pegs path — each bit determines left/right
      const path: number[] = []
      for (let i = 0; i < 8; i++) {
        const byteIdx = Math.floor(i / 8)
        const bitIdx = i % 8
        path.push((bytes[byteIdx] >> (7 - bitIdx)) & 1)
      }
      outcome = path
      formula = `Plinko path from bit extraction: [${path.join(',')}]`
      break
    }
  }

  return {
    valid: true,
    steps: {
      hmac_key: hmacKey,
      hmac_message: hmacMessage,
      raw_buffer: rawBufferHex,
      bytes: bytes.slice(0, 8),
      uint32,
      game_formula: formula!,
      result: Array.isArray(outcome) ? outcome[0] : outcome,
    },
    game,
    outcome,
  }
}

export function verifySeedHash(serverSeed: string, claimedHash: string): VerifyHashResult {
  const computed = createHash('sha256').update(serverSeed).digest('hex')
  return {
    match: computed.toLowerCase() === claimedHash.toLowerCase(),
    computed_hash: computed,
    claimed_hash: claimedHash,
  }
}

export function generateClientSeed(): string {
  return randomBytes(8).toString('hex')
}
