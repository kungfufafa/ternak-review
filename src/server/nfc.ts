import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { units } from '#/db/schema'
import { parseCode } from '#/lib/card-code'
import { getAppUrl } from '#/lib/env'

export { parseCode } from '#/lib/card-code'

export async function lookupQr(raw: string) {
  const parsed = parseCode(raw)
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, parsed.id),
    with: { batch: true },
  })
  if (!unit) throw new Error('QR kartu tidak ditemukan')
  const url = `${getAppUrl()}/r/${unit.publicId}`
  return {
    publicId: unit.publicId,
    redirectUrl: url,
    batchId: unit.batchId,
    batchLabel: unit.batch?.label ?? null,
    batchSeq: unit.batchSeq,
    nfcEncodedAt: unit.nfcEncodedAt,
  }
}

export async function markNfcEncoded(raw: string) {
  const parsed = parseCode(raw)
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, parsed.id),
  })
  if (!unit) throw new Error('Kartu tidak ditemukan')
  const [updated] = await db
    .update(units)
    .set({ nfcEncodedAt: new Date() })
    .where(eq(units.id, unit.id))
    .returning()
  if (!updated) throw new Error('Kartu tidak ditemukan')
  const url = `${getAppUrl()}/r/${updated.publicId}`
  return {
    publicId: updated.publicId,
    redirectUrl: url,
    nfcUrl: url,
    nfcEncodedAt: updated.nfcEncodedAt,
  }
}
