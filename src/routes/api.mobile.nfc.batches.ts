import { createFileRoute } from '@tanstack/react-router'
import {
  mobileAuthError,
  mobileJson,
  mobileOptions,
  requireMobileAdmin,
} from '#/server/mobile-api'
import { mobileStockPayload } from '#/server/mobile-stock'
import { assertRateLimit } from '#/server/rate-limit'
import { getClientFingerprint } from '#/server/request'

export const Route = createFileRoute('/api/mobile/nfc/batches')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      GET: async () => {
        try {
          await requireMobileAdmin()
          await assertRateLimit(`mobile-nfc:${getClientFingerprint()}`, {
            max: 80,
            windowMs: 15 * 60_000,
          })
          return mobileJson({
            ok: true,
            ...(await mobileStockPayload()),
          })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
