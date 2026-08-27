import { createStart } from '@tanstack/react-start'
import {
  csrfMiddleware,
  productionConfigMiddleware,
  securityHeadersMiddleware,
} from '#/server/middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeadersMiddleware,
    productionConfigMiddleware,
    csrfMiddleware,
  ],
}))
