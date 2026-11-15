import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createStart } from '@tanstack/react-start'
import {
  csrfMiddleware,
  productionConfigMiddleware,
  securityHeadersMiddleware,
} from '#/server/middleware'

// The Sentry middlewares go first so they see errors from everything after.
export const startInstance = createStart(() => ({
  requestMiddleware: [
    sentryGlobalRequestMiddleware,
    securityHeadersMiddleware,
    productionConfigMiddleware,
    csrfMiddleware,
  ],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
