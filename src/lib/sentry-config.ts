/**
 * Sentry settings shared by the browser and the Cloudflare server entry.
 *
 * The DSN is baked in at build time from VITE_SENTRY_DSN: `.env.production`
 * for production builds, `.env` for local development. Without it Sentry
 * stays off.
 */
export const sentryDsn: string | undefined =
  import.meta.env?.VITE_SENTRY_DSN || undefined

export const sentryEnvironment: string = import.meta.env?.MODE ?? 'development'

// Every trace locally so a test request is always visible; 10% in production.
export const sentryTracesSampleRate = import.meta.env?.DEV ? 1.0 : 0.1

/**
 * Requests here carry PINs, OTP codes and phone numbers, and the app itself
 * only stores hashed IPs. Sentry therefore gets no request or response
 * bodies, cookies, IP addresses, query-string values, query results or local
 * variables. The header denylist drops the proxy headers that carry the
 * visitor's IP (CF-Connecting-IP, X-Forwarded-For, X-Real-IP and the like).
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
}

/** Origin the browser posts events to, for the production CSP. */
export function sentryIngestOrigin(): string | null {
  if (!sentryDsn) return null
  try {
    return new URL(sentryDsn).origin
  } catch {
    return null
  }
}
