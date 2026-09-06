import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { affiliateSettings } from '#/db/schema'
import { decryptSecret, encryptSecret } from '#/lib/crypto'
import { getAffiliateWebhookUrlFromEnv } from '#/lib/env'

const PRIMARY = 'primary'
const CACHE_MS = 15_000

let cache: { url: string; at: number } | null = null

export type AffiliateWebhookPublicSettings = {
  configured: boolean
  source: 'ui' | 'env' | 'none'
  hasUiUrl: boolean
  hasEnvUrl: boolean
  url: string
  verifiedAt: number | null
}

function envUrl() {
  return getAffiliateWebhookUrlFromEnv().trim()
}

function isLocalWebhookHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function ipv4Octets(host: string) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  if (octets.some((part) => part > 255)) return null
  return octets as [number, number, number, number]
}

function isBlockedWebhookHost(host: string) {
  const hostname = host.toLowerCase().replace(/\.$/, '')
  if (isLocalWebhookHost(hostname)) return false
  if (
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.internal')
  ) {
    return true
  }
  const ipv4 = ipv4Octets(hostname)
  if (ipv4) {
    const [a, b] = ipv4
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  if (hostname.includes(':')) {
    if (
      hostname === '::' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.includes(':ffff:')
    ) {
      return true
    }
  }
  return false
}

export function normalizeAffiliateWebhookUrl(raw: string) {
  const value = raw.trim()
  if (!value) {
    throw new Error('URL webhook wajib diisi.')
  }
  if (value.length > 500) {
    throw new Error('URL webhook terlalu panjang.')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('URL webhook tidak valid.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Webhook harus http atau https.')
  }
  const host = parsed.hostname
  const local = isLocalWebhookHost(host)
  if (parsed.protocol === 'http:' && !local) {
    throw new Error('Webhook harus HTTPS, kecuali localhost.')
  }
  if (isBlockedWebhookHost(host)) {
    throw new Error('Webhook tidak boleh ke alamat internal.')
  }
  return parsed.toString()
}

async function loadRow() {
  try {
    return (
      (await db.query.affiliateSettings.findFirst({
        where: eq(affiliateSettings.id, PRIMARY),
      })) ?? null
    )
  } catch {
    return null
  }
}

async function decryptUiUrl() {
  const row = await loadRow()
  if (!row?.webhookCipher) return null
  try {
    return await decryptSecret(row.webhookCipher)
  } catch {
    return null
  }
}

export function clearAffiliateWebhookCache() {
  cache = null
}

export async function resolveAffiliateWebhookUrl() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.url
  const fromUi = await decryptUiUrl()
  const url = (fromUi ?? envUrl()).trim()
  cache = { url, at: Date.now() }
  return url
}

export async function getAffiliateWebhookPublicSettings(): Promise<AffiliateWebhookPublicSettings> {
  const row = await loadRow()
  const fromUi = await decryptUiUrl()
  const hasUiUrl = Boolean(fromUi)
  const hasEnvUrl = envUrl().length > 0
  const source = hasUiUrl ? 'ui' : hasEnvUrl ? 'env' : 'none'
  return {
    configured: source !== 'none',
    source,
    hasUiUrl,
    hasEnvUrl,
    url: (fromUi ?? envUrl()).trim(),
    verifiedAt: row?.verifiedAt?.getTime() ?? null,
  }
}

export async function saveAffiliateWebhookUrl(webhookUrl: string) {
  const url = normalizeAffiliateWebhookUrl(webhookUrl)
  const now = new Date()
  const webhookCipher = await encryptSecret(url)
  await db
    .insert(affiliateSettings)
    .values({
      id: PRIMARY,
      webhookCipher,
      verifiedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: affiliateSettings.id,
      set: {
        webhookCipher,
        verifiedAt: null,
        updatedAt: now,
      },
    })
  clearAffiliateWebhookCache()
  return getAffiliateWebhookPublicSettings()
}

export async function clearAffiliateWebhookUrl() {
  const now = new Date()
  await db
    .insert(affiliateSettings)
    .values({
      id: PRIMARY,
      webhookCipher: null,
      verifiedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: affiliateSettings.id,
      set: {
        webhookCipher: null,
        verifiedAt: null,
        updatedAt: now,
      },
    })
  clearAffiliateWebhookCache()
  return getAffiliateWebhookPublicSettings()
}

async function markVerified() {
  const existing = await loadRow()
  if (!existing?.webhookCipher) return getAffiliateWebhookPublicSettings()
  const now = new Date()
  await db
    .update(affiliateSettings)
    .set({ verifiedAt: now, updatedAt: now })
    .where(eq(affiliateSettings.id, PRIMARY))
  return getAffiliateWebhookPublicSettings()
}

export async function testAffiliateWebhookUrl(webhookUrl?: string) {
  const url = webhookUrl?.trim()
    ? normalizeAffiliateWebhookUrl(webhookUrl)
    : await resolveAffiliateWebhookUrl()
  if (!url) throw new Error('URL webhook belum diisi.')

  const payload = new FormData()
  payload.append('ternak_ping', '1')
  payload.append('nama', '[TES] webhook Ternak Review')
  payload.append('email', 'tes@ternakreview.com')
  payload.append('whatsapp', '08000000000')
  payload.append('platforms', 'tes')

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      body: payload,
      signal: AbortSignal.timeout(8_000),
      redirect: 'manual',
    })
  } catch {
    throw new Error('Webhook tidak merespons. Cek URL dan akses publiknya.')
  }
  if (!res.ok) {
    throw new Error(`Webhook menolak tes (HTTP ${res.status}).`)
  }
  if (webhookUrl?.trim()) {
    await saveAffiliateWebhookUrl(url)
  }
  return markVerified()
}
