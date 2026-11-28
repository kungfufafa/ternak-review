const WEAK_PRODUCTION_SECRETS = new Set([
  'dev-only-change-me-in-production',
  'change-me-to-a-long-random-string',
  'local-dev-auth-secret-change-in-prod',
  'change-me-to-a-different-long-random-string',
  'change-me-to-another-long-random-string',
  'change-me-to-a-third-long-random-string',
  'local-dev-admin-setup-token',
])

function isWeakProductionSecret(value: string | undefined) {
  return !value || value.length < 32 || WEAK_PRODUCTION_SECRETS.has(value)
}

export function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export function isProduction() {
  return import.meta.env?.PROD === true || readEnv('NODE_ENV') === 'production'
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
  if (!info.host || info.isLocal || !info.isHttps) {
    throw new Error(
      'Set APP_URL ke HTTPS produksi sebelum generate atau tulis NFC. URL di kartu tidak bisa diubah nanti.',
    )
  }
  return info
}

export function getAuthSecret(): string {
  const value = readEnv('AUTH_SECRET')
  if (isProduction()) {
    if (isWeakProductionSecret(value)) {
      throw new Error(
        'AUTH_SECRET wajib diisi string acak minimal 32 karakter di production.',
      )
    }
    return value as string
  }
  return value || 'dev-only-change-me-in-production'
}

export function getIpHashSalt(): string {
  return readEnv('IP_HASH_SALT') ?? getAuthSecret()
}

export function getAdminSetupToken() {
  const value = readEnv('ADMIN_SETUP_TOKEN')
  if (isProduction()) {
    if (isWeakProductionSecret(value)) {
      throw new Error(
        'ADMIN_SETUP_TOKEN wajib diisi string acak minimal 32 karakter di production.',
      )
    }
    return value as string
  }
  return value ?? 'local-dev-admin-setup-token'
}

export function isTrustedProxyEnabled() {
  const value = readEnv('TRUST_PROXY')?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export function getGoogleMapsApiKeyFromEnv() {
  return readEnv('GOOGLE_MAPS_API_KEY') ?? ''
}

export function getGoogleMapsApiKey() {
  return getGoogleMapsApiKeyFromEnv()
}

export function getWhatsappGatewayToken() {
  return readEnv('WHATSAPP_GATEWAY_TOKEN') ?? 'local-whatsapp-gateway-token'
}

export function isWhatsappGatewayConfigured() {
  return Boolean(readEnv('WHATSAPP_GATEWAY_TOKEN'))
}

export function assertProductionConfig() {
  if (!isProduction()) return

  assertAppUrlForProduction()
  const authSecret = getAuthSecret()
  const setupToken = getAdminSetupToken()
  const ipSalt = readEnv('IP_HASH_SALT')
  if (isWeakProductionSecret(ipSalt)) {
    throw new Error(
      'IP_HASH_SALT wajib diisi string acak minimal 32 karakter di production.',
    )
  }
  if (
    ipSalt === authSecret ||
    setupToken === authSecret ||
    ipSalt === setupToken
  ) {
    throw new Error(
      'AUTH_SECRET, IP_HASH_SALT, dan ADMIN_SETUP_TOKEN wajib memakai nilai berbeda.',
    )
  }
}
