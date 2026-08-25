import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { units } from '#/db/schema'
import { getAppUrl } from '#/lib/env'

export function parseCode(raw: string) {
  const text = raw.trim().toUpperCase()
  const qr = text.match(/\/R\/([2-9A-HJ-NP-Z]+)/)
  if (qr?.[1]) return { kind: 'qr' as const, id: qr[1] }
  const id = text.replace(/[^2-9A-HJ-NP-Z]/g, '')
  if (id.length >= 8) return { kind: 'id' as const, id }
  throw new Error('Kode tidak valid. Scan QR kartu.')
}

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
