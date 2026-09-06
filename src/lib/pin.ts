import { hashToken, timingSafeEqualText } from './crypto'

const TRIVIAL_PINS = new Set([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '0123',
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '9876',
  '8765',
  '7654',
  '6543',
  '5432',
  '4321',
  '3210',
])

export function normalizePin(raw: string) {
  const pin = raw.trim()
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN harus 4 digit angka.')
  }
  if (TRIVIAL_PINS.has(pin)) {
    throw new Error('PIN terlalu mudah ditebak.')
  }
  return pin
}

export function generatePin() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    const pin = String(value % 10_000).padStart(4, '0')
    if (!TRIVIAL_PINS.has(pin)) return pin
  }
  return '2580'
}

export function hashPin(pin: string) {
  return hashToken(`holder-pin:${pin}`)
}

export function pinMatches(pin: string, pinHash: string | null) {
  if (!pinHash) return false
  try {
    return timingSafeEqualText(hashPin(normalizePin(pin)), pinHash)
  } catch {
    return false
  }
}
