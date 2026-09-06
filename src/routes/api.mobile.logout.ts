import { createFileRoute } from '@tanstack/react-router'
import { destroyCurrentSession } from '#/server/auth'
import {
  mobileAuthError,
  mobileJson,
  mobileOptions,
} from '#/server/mobile-api'

export const Route = createFileRoute('/api/mobile/logout')({
  server: {
    handlers: {
      OPTIONS: async () => mobileOptions(),
      POST: async () => {
        try {
          await destroyCurrentSession()
          return mobileJson({ ok: true })
        } catch (error) {
          return mobileAuthError(error)
        }
      },
    },
  },
})
