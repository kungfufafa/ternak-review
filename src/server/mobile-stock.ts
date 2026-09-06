import { getAppUrlInfo } from '#/lib/env'
import { listStockBatches } from '#/server/stock'

export function serializeMobileBatch(
  batch: Awaited<ReturnType<typeof listStockBatches>>[number],
) {
  const createdAt =
    batch.createdAt instanceof Date
      ? batch.createdAt.toISOString()
      : new Date(batch.createdAt).toISOString()
  return {
    id: batch.id,
    label: batch.label,
    count: batch.count,
    encoded: batch.encoded,
    inStock: batch.inStock,
    available: batch.available,
    assigned: batch.assigned,
    remaining: batch.remaining,
    readyStock: batch.readyStock,
    active: batch.active,
    inactive: batch.inactive,
    next: batch.next,
    createdAt,
  }
}

export async function mobileStockPayload() {
  const batches = await listStockBatches()
  return {
    appUrl: getAppUrlInfo(),
    batches: batches.map(serializeMobileBatch),
  }
}
