import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { nfcTags, units } from '#/db/schema'
import { getAppUrl } from '#/lib/env'
import { resolveRedirect, type RedirectResult } from '#/server/redirect'

export function parseCode(raw: string) {
  const text = raw.trim().toUpperCase()
  const nfc = text.match(/\/N\/([2-9A-HJ-NP-Z]+)/)
  if (nfc?.[1]) return { kind: 'nfc' as const, id: nfc[1] }
  const qr = text.match(/\/R\/([2-9A-HJ-NP-Z]+)/)
  if (qr?.[1]) return { kind: 'qr' as const, id: qr[1] }
  const id = text.replace(/[^2-9A-HJ-NP-Z]/g, '')
  if (id.length >= 8) return { kind: 'id' as const, id }
  throw new Error('Kode tidak valid. Scan QR kartu atau stiker NFC.')
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
    kind: 'qr' as const,
    publicId: unit.publicId,
    redirectUrl: url,
    batchId: unit.batchId,
    batchLabel: unit.batch?.label ?? null,
    batchSeq: unit.batchSeq,
    nfcPublicId: unit.publicId,
    nfcUrl: url,
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

export async function resolveNfcRedirect(
  nfcPublicId: string,
): Promise<RedirectResult | { kind: 'unpaired' }> {
  const tag = await db.query.nfcTags.findFirst({
    where: eq(nfcTags.publicId, nfcPublicId.toUpperCase()),
    with: { unit: true },
  })
  if (!tag) return { kind: 'not_found' }
  if (!tag.unit) return { kind: 'unpaired' }
  return resolveRedirect(tag.unit.publicId)
}
