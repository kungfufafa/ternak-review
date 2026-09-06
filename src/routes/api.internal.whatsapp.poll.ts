import { createFileRoute } from '@tanstack/react-router'
import {
  gatewayError,
  isGatewayAuthorized,
  pollWhatsappGateway,
  whatsappPollSchema,
} from '#/server/whatsapp'

export const Route = createFileRoute('/api/internal/whatsapp/poll')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isGatewayAuthorized(request)) {
          return gatewayError('Unauthorized', 401)
        }
        try {
          const body = whatsappPollSchema.parse(await request.json())
          return Response.json(
            await pollWhatsappGateway({
              workerId: body.workerId,
              connected: body.connected,
            }),
          )
        } catch (error) {
          return gatewayError(
            error instanceof Error ? error.message : 'Polling gateway gagal.',
            409,
          )
        }
      },
    },
  },
})
