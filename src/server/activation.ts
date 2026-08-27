import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { outlets, units } from '#/db/schema'
import { getPlaceDetails } from './places'
import { assertRateLimit } from './rate-limit'
import { hashRateLimitIdentifier } from './request'

function normalizePartnerRef(raw?: string | null) {
  const value = raw?.trim().replace(/\s+/g, ' ') ?? ''
  return value.length > 0 ? value.slice(0, 80) : null
}

export async function getActivationCard(publicId: string) {
  const id = publicId.trim().toUpperCase()
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, id),
  })
  if (!unit) return null
  return {
    publicId: unit.publicId,
    status: unit.status,
  }
}

export async function activateUnit(input: {
  publicId: string
  placeId: string
  partnerRef?: string
  clientKey?: string | null
}) {
  const publicId = input.publicId.trim().toUpperCase()
  await assertRateLimit(
    `activate-card:${hashRateLimitIdentifier(publicId)}`,
    { max: 20, windowMs: 60 * 60_000 },
  )
  if (input.clientKey) {
    await assertRateLimit(`activate-client:${input.clientKey}`, {
      max: 20,
      windowMs: 60 * 60_000,
    })
  }

  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId),
  })
  if (!unit) throw new Error('Kartu tidak ditemukan')
  if (unit.status !== 'IN_STOCK') {
    throw new Error('Kartu sudah diaktivasi.')
  }

  const details = await getPlaceDetails(input.placeId)

  const [outlet] = await db
    .insert(outlets)
    .values({
      googlePlaceId: details.placeId,
      name: details.name,
      formattedAddress: details.formattedAddress,
      photoUrl: details.photoUrl,
    })
    .onConflictDoUpdate({
      target: outlets.googlePlaceId,
      set: {
        name: details.name,
        formattedAddress: details.formattedAddress,
        photoUrl: details.photoUrl,
        updatedAt: new Date(),
      },
    })
    .returning({ id: outlets.id })
  if (!outlet) throw new Error('Gagal menyimpan outlet')
  const outletId = outlet.id

  const partnerRef = normalizePartnerRef(input.partnerRef)

  const [updated] = await db
    .update(units)
    .set({
      status: 'ACTIVE',
      outletId,
      ownerId: null,
      partnerRef,
      activatedAt: new Date(),
    })
    .where(and(eq(units.id, unit.id), eq(units.status, 'IN_STOCK')))
    .returning()

  if (!updated) {
    throw new Error('Aktivasi gagal — kartu mungkin sudah diklaim')
  }

  return {
    unitId: updated.id,
    publicId: updated.publicId,
    outlet: details,
    partnerRef,
  }
}
