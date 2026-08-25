import { createFileRoute } from '@tanstack/react-router'
import { getDeployTarget } from '#/lib/deploy-target'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: 'review-kit',
          target: getDeployTarget(),
          ts: new Date().toISOString(),
        }),
    },
  },
})
