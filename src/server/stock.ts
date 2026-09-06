import { asc, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, insertBatchWithUnits } from '#/db'
import { stockBatches, units } from '#/db/schema'
import { generatePublicId } from '#/lib/crypto'
import { getAppUrl } from '#/lib/env'
import { batchNextStep } from '#/lib/stock-progress'

export { batchNextStep }
export type { BatchNextStep } from '#/lib/stock-progress'

function cardUrl(publicId: string) {
  return `${getAppUrl()}/r/${publicId}`
}

export type GeneratedUnit = {
  publicId: string
  redirectUrl: string
  batchSeq: number
}

const MAX_BATCH = 1000

function defaultLabel(count: number) {
  const day = new Date().toISOString().slice(0, 10)
  return `Card ${count} · ${day}`
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function unitsToCsv(
  rows: Array<{
    batchLabel?: string
    batchSeq?: number | null
    publicId: string
    status?: string
    redirectUrl: string
  }>,
) {
  const header = 'batch,seq,public_id,status,qr_url,nfc_url'
  const lines = rows.map((row) =>
    [
      csvEscape(row.batchLabel ?? ''),
      String(row.batchSeq ?? ''),
      row.publicId,
      row.status ?? 'IN_STOCK',
      row.redirectUrl,
      row.redirectUrl,
    ].join(','),
  )
  return [header, ...lines].join('\n')
}

async function uniquePublicIds(need: number) {
  const publicIds = new Set<string>()
  while (publicIds.size < need) {
    publicIds.add(generatePublicId())
  }

  const taken = await db
    .select({ publicId: units.publicId })
    .from(units)
    .where(inArray(units.publicId, [...publicIds]))
  for (const row of taken) publicIds.delete(row.publicId)

  while (publicIds.size < need) {
    publicIds.add(generatePublicId())
  }
  return [...publicIds]
}

export async function generateStockBatch(input: {
  count: number
  label?: string
}) {
  const count = Math.min(Math.max(Math.floor(input.count), 1), MAX_BATCH)
  const label = input.label?.trim().slice(0, 80) || defaultLabel(count)
  const publicIds = await uniquePublicIds(count)

  const generated: GeneratedUnit[] = publicIds.map((publicId, i) => ({
    publicId,
    redirectUrl: cardUrl(publicId),
    batchSeq: i + 1,
  }))

  const values = generated.map((g) => ({
    publicId: g.publicId,
    type: 'CARD' as const,
    status: 'IN_STOCK' as const,
    batchSeq: g.batchSeq,
  }))

  const batch = await insertBatchWithUnits(
    { label, type: 'CARD', count },
    values,
  )

  const csv = unitsToCsv(
    generated.map((g) => ({
      batchLabel: label,
      batchSeq: g.batchSeq,
      publicId: g.publicId,
      status: 'IN_STOCK',
      redirectUrl: g.redirectUrl,
    })),
  )

  return {
    batchId: batch.id,
    label,
    units: generated,
    csv,
  }
}

export async function listStockBatches() {
  const batches = await db.query.stockBatches.findMany({
    orderBy: [desc(stockBatches.createdAt)],
  })

  const counts = await db
    .select({
      batchId: units.batchId,
      status: units.status,
      n: count(),
      assigned: count(units.ownerId),
      readyStock: sql<number>`sum(case when ${units.ownerId} is null and ${units.nfcEncodedAt} is not null then 1 else 0 end)`,
    })
    .from(units)
    .groupBy(units.batchId, units.status)

  const byBatch = new Map<
    string,
    {
      inStock: number
      active: number
      inactive: number
      available: number
      assigned: number
      readyStock: number
    }
  >()
  for (const row of counts) {
    if (!row.batchId) continue
    const cur = byBatch.get(row.batchId) ?? {
      inStock: 0,
      active: 0,
      inactive: 0,
      available: 0,
      assigned: 0,
      readyStock: 0,
    }
    const n = Number(row.n)
    if (row.status === 'IN_STOCK') {
      cur.inStock = n
      cur.assigned = Number(row.assigned)
      cur.available = n - cur.assigned
      cur.readyStock = Number(row.readyStock ?? 0)
    } else if (row.status === 'ACTIVE') cur.active = n
    else cur.inactive = n
    byBatch.set(row.batchId, cur)
  }

  const encodedRows = await db
    .select({
      batchId: units.batchId,
      n: count(),
    })
    .from(units)
    .where(isNotNull(units.nfcEncodedAt))
    .groupBy(units.batchId)

  const encodedByBatch = new Map(
    encodedRows.map((row) => [row.batchId, Number(row.n)]),
  )

  return batches.map((b) => {
    const status = byBatch.get(b.id) ?? {
      inStock: 0,
      active: 0,
      inactive: 0,
      available: 0,
      assigned: 0,
      readyStock: 0,
    }
    const remaining = status.inStock + status.active + status.inactive
    const encoded = encodedByBatch.get(b.id) ?? 0
    return {
      id: b.id,
      label: b.label,
      type: b.type,
      count: b.count,
      createdAt: b.createdAt,
      inStock: status.inStock,
      active: status.active,
      inactive: status.inactive,
      available: status.available,
      assigned: status.assigned,
      readyStock: status.readyStock,
      remaining,
      encoded,
      next: batchNextStep({ remaining, encoded }),
    }
  })
}

export async function deleteStockBatch(batchId: string) {
  const batch = await db.query.stockBatches.findFirst({
    where: eq(stockBatches.id, batchId),
  })
  if (!batch) return { ok: false as const, error: 'Cetakan tidak ditemukan.' }

  const rows = await db
    .select({ status: units.status, ownerId: units.ownerId })
    .from(units)
    .where(eq(units.batchId, batchId))

  if (rows.some((row) => row.status !== 'IN_STOCK')) {
    return {
      ok: false as const,
      error: 'Cetakan yang sudah dipakai toko tidak bisa dihapus.',
    }
  }
  if (rows.some((row) => row.ownerId)) {
    return {
      ok: false as const,
      error:
        'Cetakan memiliki kartu yang sudah dialokasikan. Lepas pemegangnya dulu jika cetakan ini memang akan dihapus.',
    }
  }

  await db.delete(units).where(eq(units.batchId, batchId))
  await db.delete(stockBatches).where(eq(stockBatches.id, batchId))
  return { ok: true as const }
}

export async function getBatchPrintData(input: { batchId: string }) {
  const batch = await db.query.stockBatches.findFirst({
    where: eq(stockBatches.id, input.batchId),
  })
  if (!batch) throw new Error('Batch tidak ditemukan')

  const rows = await db.query.units.findMany({
    where: eq(units.batchId, batch.id),
    orderBy: [asc(units.batchSeq)],
  })

  const items = rows.map((row) => {
    const redirectUrl = cardUrl(row.publicId)
    return {
      publicId: row.publicId,
      type: row.type,
      status: row.status,
      batchSeq: row.batchSeq,
      redirectUrl,
      nfcEncodedAt: row.nfcEncodedAt,
    }
  })

  return {
    batch: {
      id: batch.id,
      label: batch.label,
      type: batch.type,
      count: batch.count,
      createdAt: batch.createdAt,
    },
    units: items,
    csv: unitsToCsv(
      items.map((item) => ({
        batchLabel: batch.label,
        batchSeq: item.batchSeq,
        publicId: item.publicId,
        status: item.status,
        redirectUrl: item.redirectUrl,
      })),
    ),
  }
}
