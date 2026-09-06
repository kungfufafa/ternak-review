import { createFileRoute } from '@tanstack/react-router'
import { assertAppUrlForProduction } from '#/lib/env'
import { markNfcEncoded } from '#/server/nfc'
import {
  mobileAuthError,
  mobileJson,
  mobileOptions,
  mobileRefSchema,
  readJsonBody,
  requireMobileAdmin,
} from '#/server/mobile-api'
import { assertRateLimit } from '#/server/rate-limit'
import { getClientFingerprint } from '#/server/request'

export const Route = createFileRoute('/api/mobile/nfc/mark')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      POST: async ({ request }) => {
        try {
          await requireMobileAdmin()
          assertAppUrlForProduction()
          await assertRateLimit(`mobile-nfc:${getClientFingerprint()}`, {
            max: 80,
            windowMs: 15 * 60_000,
          })
          const body = mobileRefSchema.parse(await readJsonBody(request))
          const card = await markNfcEncoded(body.ref)
          return mobileJson({ ok: true, card })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
