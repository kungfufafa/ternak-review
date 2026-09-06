import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { whatsappGatewayState } from '#/db/schema'

const HEARTBEAT_FRESH_MS = 45_000

export async function isWhatsappGatewayOpen() {
  const state = await db.query.whatsappGatewayState.findFirst({
    where: eq(whatsappGatewayState.id, 'primary'),
  })
  const heartbeat = state?.lastHeartbeatAt?.getTime() ?? 0
  return state?.status === 'OPEN' && heartbeat > Date.now() - HEARTBEAT_FRESH_MS
}
