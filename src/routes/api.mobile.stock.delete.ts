import { createFileRoute } from '@tanstack/react-router'
import {
  mobileAuthError,
  mobileBatchIdSchema,
  mobileError,
  mobileJson,
  mobileOptions,
  readJsonBody,
  requireMobileAdmin,
} from '#/server/mobile-api'
import { assertRateLimit } from '#/server/rate-limit'
import { getClientFingerprint } from '#/server/request'
import { deleteStockBatch } from '#/server/stock'

export const Route = createFileRoute('/api/mobile/stock/delete')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      POST: async ({ request }) => {
        try {
          await requireMobileAdmin()
          await assertRateLimit(`mobile-stock:${getClientFingerprint()}`, {
            max: 20,
            windowMs: 15 * 60_000,
          })
          const body = mobileBatchIdSchema.parse(await readJsonBody(request))
          const result = await deleteStockBatch(body.batchId)
          if (!result.ok) return mobileError(result.error, 400)
          return mobileJson({ ok: true })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
