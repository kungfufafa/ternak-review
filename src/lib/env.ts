const WEAK_AUTH_SECRETS = new Set([
  'dev-only-change-me-in-production',
  'change-me-to-a-long-random-string',
  'local-dev-auth-secret-change-in-prod',
])

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

function isProduction() {
  return readEnv('NODE_ENV') === 'production'
}

export function getAppUrl() {
  return (
    readEnv('APP_URL') ??
    readEnv('VITE_APP_URL') ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export type AppUrlInfo = {
  url: string
  host: string
  isLocal: boolean
  isHttps: boolean
  production: boolean
}

export function getAppUrlInfo(): AppUrlInfo {
  const url = getAppUrl()
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    host = ''
  }
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  return {
    url,
    host,
    isLocal,
    isHttps: url.startsWith('https://'),
    production: isProduction(),
  }
}

export function assertAppUrlForProduction() {
  const info = getAppUrlInfo()
  if (!info.production) return info
  if (info.isLocal || !info.isHttps) {
    throw new Error(
      'Set APP_URL ke HTTPS produksi sebelum generate atau tulis NFC. URL di kartu tidak bisa diubah nanti.',
    )
  }
  return info
}

export function getAuthSecret() {
  const value = readEnv('AUTH_SECRET')
  if (isProduction()) {
    if (!value || WEAK_AUTH_SECRETS.has(value) || value.length < 32) {
      throw new Error(
        'AUTH_SECRET wajib diisi string acak minimal 32 karakter di production.',
      )
    }
    return value
  }
  return value || 'dev-only-change-me-in-production'
}

export function getIpHashSalt() {
  return readEnv('IP_HASH_SALT') ?? getAuthSecret()
}

export function getGoogleMapsApiKey() {
  return readEnv('GOOGLE_MAPS_API_KEY') ?? ''
}

export function getAffiliateWebhookUrl() {
  return readEnv('AFFILIATE_WEBHOOK_URL')?.trim() ?? ''
}
