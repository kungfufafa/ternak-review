import {
  createCsrfMiddleware,
  createMiddleware,
} from '@tanstack/react-start'
import { getResponseHeaders } from '@tanstack/react-start/server'
import { getDb } from '#/db'
import {
  assertProductionConfig,
  isProduction,
} from '#/lib/env'
import { sentryIngestOrigin } from '#/lib/sentry-config'

export const securityHeadersMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const pathname = new URL(request.url).pathname
    const headers: Record<string, string> = {
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy':
        'camera=(self), geolocation=(self), microphone=()',
    }

    if (isProduction()) {
      // With Sentry on, the browser posts events to the ingest host and
      // Session Replay compresses in a blob: worker (child-src: old Safari).
      const sentryOrigin = sentryIngestOrigin()
      headers['Content-Security-Policy'] = [
        "default-src 'self'",
        "base-uri 'self'",
        sentryOrigin ? `connect-src 'self' ${sentryOrigin}` : "connect-src 'self'",
        "font-src 'self' data: https://fonts.gstatic.com",
        "form-action 'self'",
        "frame-src 'self' https://www.google.com",
        "frame-ancestors 'none'",
        "img-src 'self' data: https:",
        "object-src 'none'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        ...(sentryOrigin
          ? ["worker-src 'self' blob:", "child-src 'self' blob:"]
          : []),
      ].join('; ')
      headers['Strict-Transport-Security'] =
        'max-age=63072000; includeSubDomains'
    }

    if (pathname.startsWith('/api/mobile/')) {
      headers['Cache-Control'] = 'no-store'
      headers['Access-Control-Allow-Origin'] = '*'
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    }

    if (
      pathname === '/' ||
      pathname === '/health' ||
      pathname === '/login' ||
      pathname === '/activate' ||
      pathname === '/affiliate' ||
      pathname === '/r-status' ||
      pathname.startsWith('/r/') ||
      pathname.startsWith('/feedback/') ||
      pathname.startsWith('/api/internal/') ||
      pathname.startsWith('/api/mobile/') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/app') ||
      pathname.startsWith('/_serverFn/')
    ) {
      headers['Cache-Control'] = 'no-store'
      headers.Vary = 'Cookie'
    }

    const responseHeaders = getResponseHeaders()
    for (const [name, value] of Object.entries(headers)) {
      responseHeaders.set(name, value)
    }
    const withSecurityHeaders = (response: Response) => {
      const mergedHeaders = new Headers(response.headers)
      for (const [name, value] of Object.entries(headers)) {
        mergedHeaders.set(name, value)
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: mergedHeaders,
      })
    }

    const result = await next()
    if (result instanceof Response) return withSecurityHeaders(result)
    if (
      typeof result === 'object' &&
      result !== null &&
      'response' in result &&
      result.response instanceof Response
    ) {
      return { ...result, response: withSecurityHeaders(result.response) }
    }
    return result
  },
)

export const productionConfigMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (!isProduction() || new URL(request.url).pathname === '/health') {
      return next()
    }

    try {
      getDb()
      assertProductionConfig()
    } catch (error) {
      console.error(
        '[production-config]',
        error instanceof Error ? error.message : 'Konfigurasi tidak valid',
      )
      return new Response('Service unavailable', { status: 503 })
    }
    return next()
  },
)

export const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})
