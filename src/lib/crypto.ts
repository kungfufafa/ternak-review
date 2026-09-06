import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { customAlphabet } from 'nanoid'
import { getDeployTarget } from './deploy-target'
import { getAuthSecret, getIpHashSalt } from './env'

const publicIdAlphabet = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10)
const encoder = new TextEncoder()

/** Cloudflare WebCrypto rejects PBKDF2 above 100_000 iterations. */
export const PBKDF2_ITERATIONS_NODE = 600_000
export const PBKDF2_ITERATIONS_CLOUDFLARE = 100_000

export function pbkdf2Iterations() {
  return getDeployTarget() === 'cloudflare'
    ? PBKDF2_ITERATIONS_CLOUDFLARE
    : PBKDF2_ITERATIONS_NODE
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (iterations > PBKDF2_ITERATIONS_CLOUDFLARE && /100000|iteration/i.test(message)) {
      throw new Error(
        'Hash password ini tidak bisa diverifikasi di Cloudflare. Reset password di VPS/Node, atau buat akun ulang.',
      )
    }
    throw error
  }
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

async function aesKey() {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(getAuthSecret()),
  )
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(),
    encoder.encode(plain),
  )
  return `v1:${toHex(iv)}:${toHex(new Uint8Array(data))}`
}

export async function decryptSecret(stored: string) {
  const [version, ivHex, dataHex] = stored.split(':')
  if (version !== 'v1' || !ivHex || !dataHex) {
    throw new Error('Rahasia tersimpan tidak valid.')
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromHex(ivHex) as BufferSource },
    await aesKey(),
    fromHex(dataHex) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}

export function timingSafeEqualText(a: string, b: string) {
  const aDigest = createHash('sha256').update(a).digest()
  const bDigest = createHash('sha256').update(b).digest()
  return timingSafeEqual(aDigest, bDigest)
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

export function passwordHashNeedsUpgrade(stored: string | null) {
  if (!stored) return true
  const [algorithm, rawIterations] = stored.split(':')
  return (
    algorithm !== 'pbkdf2' || Number(rawIterations) < pbkdf2Iterations()
  )
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
