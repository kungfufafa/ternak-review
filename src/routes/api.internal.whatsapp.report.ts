import { createFileRoute } from '@tanstack/react-router'
import {
  gatewayError,
  isGatewayAuthorized,
  reportWhatsappGateway,
  whatsappReportSchema,
} from '#/server/whatsapp'

export const Route = createFileRoute('/api/internal/whatsapp/report')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isGatewayAuthorized(request)) {
          return gatewayError('Unauthorized', 401)
        }
        try {
          const body = whatsappReportSchema.parse(await request.json())
          return Response.json(await reportWhatsappGateway(body))
        } catch (error) {
          return gatewayError(
            error instanceof Error ? error.message : 'Laporan gateway gagal.',
            409,
          )
        }
      },
    },
  },
})
