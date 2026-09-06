import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { googleSettings } from '#/db/schema'
import { decryptSecret, encryptSecret } from '#/lib/crypto'
import { getGoogleMapsApiKeyFromEnv } from '#/lib/env'

const PRIMARY = 'primary'
const CACHE_MS = 15_000

let cache: { key: string; at: number } | null = null

export type GooglePlacesPublicSettings = {
  configured: boolean
  source: 'ui' | 'env' | 'none'
  hasUiKey: boolean
  hasEnvKey: boolean
  last4: string | null
  verifiedAt: number | null
}

function envKey() {
  return getGoogleMapsApiKeyFromEnv().trim()
}

function last4Of(key: string) {
  return key.slice(-4)
}

function normalizeKey(raw: string) {
  const key = raw.trim()
  if (key.length < 20 || key.length > 200 || /\s/.test(key)) {
    throw new Error(
      'API key Google tidak valid. Tempel key dari Google Cloud (Places API New).',
    )
  }
  return key
}

async function loadRow() {
  try {
    return (
      (await db.query.googleSettings.findFirst({
        where: eq(googleSettings.id, PRIMARY),
      })) ?? null
    )
  } catch {
    return null
  }
}

async function decryptUiKey() {
  const row = await loadRow()
  if (!row?.apiKeyCipher) return null
  try {
    return await decryptSecret(row.apiKeyCipher)
  } catch {
    return null
  }
}

export function clearGooglePlacesKeyCache() {
  cache = null
}

export async function resolveGoogleMapsApiKey() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.key
  const fromUi = await decryptUiKey()
  const key = (fromUi ?? envKey()).trim()
  cache = { key, at: Date.now() }
  return key
}

export async function isGooglePlacesConfigured() {
  return (await resolveGoogleMapsApiKey()).length > 0
}

export async function getGooglePlacesPublicSettings(): Promise<GooglePlacesPublicSettings> {
  const row = await loadRow()
  const fromUi = await decryptUiKey()
  const hasUiKey = Boolean(fromUi)
  const hasEnvKey = envKey().length > 0
  const source = hasUiKey ? 'ui' : hasEnvKey ? 'env' : 'none'
  return {
    configured: source !== 'none',
    source,
    hasUiKey,
    hasEnvKey,
    last4: fromUi ? last4Of(fromUi) : null,
    verifiedAt: row?.verifiedAt?.getTime() ?? null,
  }
}

export async function saveGooglePlacesKey(apiKey: string) {
  const key = normalizeKey(apiKey)
  const now = new Date()
  const apiKeyCipher = await encryptSecret(key)
  const last4 = last4Of(key)
  await db
    .insert(googleSettings)
    .values({
      id: PRIMARY,
      apiKeyCipher,
      last4,
      verifiedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleSettings.id,
      set: {
        apiKeyCipher,
        last4,
        verifiedAt: null,
        updatedAt: now,
      },
    })
  clearGooglePlacesKeyCache()
  return getGooglePlacesPublicSettings()
}

export async function clearGooglePlacesKey() {
  const now = new Date()
  await db
    .insert(googleSettings)
    .values({
      id: PRIMARY,
      apiKeyCipher: null,
      last4: null,
      verifiedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleSettings.id,
      set: {
        apiKeyCipher: null,
        last4: null,
        verifiedAt: null,
        updatedAt: now,
      },
    })
  clearGooglePlacesKeyCache()
  return getGooglePlacesPublicSettings()
}

export async function markGooglePlacesVerified() {
  const existing = await loadRow()
  if (!existing?.apiKeyCipher) return getGooglePlacesPublicSettings()
  const now = new Date()
  await db
    .update(googleSettings)
    .set({ verifiedAt: now, updatedAt: now })
    .where(eq(googleSettings.id, PRIMARY))
  return getGooglePlacesPublicSettings()
}

export async function testGooglePlacesKey(apiKey?: string) {
  const key = apiKey?.trim()
    ? normalizeKey(apiKey)
    : await resolveGoogleMapsApiKey()
  if (!key) {
    throw new Error('API key Google belum diisi.')
  }
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId',
    },
    body: JSON.stringify({
      input: 'kopi',
      languageCode: 'id',
      regionCode: 'ID',
    }),
  })
  const data = (await res.json()) as {
    error?: { message?: string; status?: string }
  }
  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message ??
        `Google Places menolak key (${res.status}). Cek Places API (New) dan kuota.`,
    )
  }
  if (apiKey?.trim()) {
    await saveGooglePlacesKey(key)
  }
  await markGooglePlacesVerified()
  return getGooglePlacesPublicSettings()
}
