import { createFileRoute } from '@tanstack/react-router'
import { assertAppUrlForProduction } from '#/lib/env'
import {
  mobileAuthError,
  mobileGenerateSchema,
  mobileJson,
  mobileOptions,
  readJsonBody,
  requireMobileAdmin,
} from '#/server/mobile-api'
import { assertRateLimit } from '#/server/rate-limit'
import { getClientFingerprint } from '#/server/request'
import { generateStockBatch } from '#/server/stock'

export const Route = createFileRoute('/api/mobile/stock/generate')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      POST: async ({ request }) => {
        try {
          await requireMobileAdmin()
          assertAppUrlForProduction()
          await assertRateLimit(`mobile-stock:${getClientFingerprint()}`, {
            max: 20,
            windowMs: 15 * 60_000,
          })
          const body = mobileGenerateSchema.parse(await readJsonBody(request))
          const batch = await generateStockBatch(body)
          return mobileJson({
            ok: true,
            batchId: batch.batchId,
            label: batch.label,
            count: batch.units.length,
          })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
