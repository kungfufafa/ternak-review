import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { customAlphabet } from 'nanoid'
import { getDeployTarget } from './deploy-target'
import { getAuthSecret, getIpHashSalt } from './env'

const publicIdAlphabet = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10)
const encoder = new TextEncoder()

function pbkdf2Iterations() {
  return getDeployTarget() === 'cloudflare' ? 12_000 : 100_000
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!
  return out === 0
}

async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export function generatePublicId() {
  return publicIdAlphabet()
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256')
    .update(`${getAuthSecret()}:${token}`)
    .digest('hex')
}

export function hashIp(ip: string | null | undefined) {
  if (!ip) return null
  return createHash('sha256')
    .update(`${getIpHashSalt()}:${ip}`)
    .digest('hex')
}

export async function hashPassword(password: string) {
  const iterations = pbkdf2Iterations()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2Sha256(password, salt, iterations)
  return `pbkdf2:${iterations}:${toHex(salt)}:${toHex(hash)}`
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false
  const parts = stored.split(':')
  const algo = parts[0]
  if (algo === 'pbkdf2') {
    const iterations = Number(parts[1])
    const saltHex = parts[2]
    const hashHex = parts[3]
    if (!iterations || !saltHex || !hashHex) return false
    const computed = await pbkdf2Sha256(password, fromHex(saltHex), iterations)
    return timingSafeEqualBytes(computed, fromHex(hashHex))
  }
  if (algo === 'scrypt') {
    const saltHex = parts[1]
    const hashHex = parts[2]
    if (!saltHex || !hashHex) return false
    const computed = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
    const expected = Buffer.from(hashHex, 'hex')
    if (computed.length !== expected.length) return false
    return timingSafeEqual(computed, expected)
  }
  return false
}
