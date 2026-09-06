import { createFileRoute } from '@tanstack/react-router'
import {
  createSessionForOwner,
  verifyPasswordLogin,
} from '#/server/auth'
import {
  mobileAuthError,
  mobileError,
  mobileJson,
  mobileLoginSchema,
  mobileOptions,
  readJsonBody,
} from '#/server/mobile-api'
import { assertRateLimit } from '#/server/rate-limit'
import {
  getClientFingerprint,
  hashRateLimitIdentifier,
} from '#/server/request'

export const Route = createFileRoute('/api/mobile/login')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      POST: async ({ request }) => {
        try {
          const body = mobileLoginSchema.parse(await readJsonBody(request))
          await assertRateLimit(`login-client:${getClientFingerprint()}`)
          await assertRateLimit(
            `login-account:${hashRateLimitIdentifier(body.email)}`,
            { max: 50, windowMs: 60 * 60_000 },
          )
          const owner = await verifyPasswordLogin(body.email, body.password)
          if (owner.role !== 'ADMIN') {
            return mobileError(
              'Hanya admin yang bisa nulis NFC dari app.',
              403,
            )
          }
          const token = await createSessionForOwner(owner.id, { cookie: false })
          return mobileJson({
            ok: true,
            token,
            owner: {
              email: owner.email,
              name: owner.name,
              role: owner.role,
            },
          })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
