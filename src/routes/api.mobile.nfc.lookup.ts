import { createFileRoute } from '@tanstack/react-router'
import { lookupQr } from '#/server/nfc'
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

export const Route = createFileRoute('/api/mobile/nfc/lookup')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      POST: async ({ request }) => {
        try {
          await requireMobileAdmin()
          await assertRateLimit(`mobile-nfc:${getClientFingerprint()}`, {
            max: 80,
            windowMs: 15 * 60_000,
          })
          const body = mobileRefSchema.parse(await readJsonBody(request))
          const card = await lookupQr(body.ref)
          return mobileJson({ ok: true, card })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
