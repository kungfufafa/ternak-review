import { createFileRoute } from '@tanstack/react-router'
import {
  mobileAuthError,
  mobileJson,
  mobileOptions,
  requireMobileAdmin,
} from '#/server/mobile-api'

export const Route = createFileRoute('/api/mobile/me')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      GET: async () => {
        try {
          const owner = await requireMobileAdmin()
          return mobileJson({
            ok: true,
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
