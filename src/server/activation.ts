import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { outlets, units } from '#/db/schema'
import { getPlaceDetails } from './places'
import { assertRateLimit } from './rate-limit'

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
  ip?: string | null
}) {
  const publicId = input.publicId.trim().toUpperCase()
  await assertRateLimit(`activate:${publicId}:${input.ip ?? 'unknown'}`)

  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId),
  })
  if (!unit) throw new Error('Kartu tidak ditemukan')
  if (unit.status !== 'IN_STOCK') {
    throw new Error('Kartu sudah diaktivasi.')
  }

  const details = await getPlaceDetails(input.placeId)

  const existingOutlet = await db.query.outlets.findFirst({
    where: eq(outlets.googlePlaceId, details.placeId),
  })

  let outletId: string
  if (existingOutlet) {
    await db
      .update(outlets)
      .set({
        name: details.name,
        formattedAddress: details.formattedAddress,
        photoUrl: details.photoUrl,
        updatedAt: new Date(),
      })
      .where(eq(outlets.id, existingOutlet.id))
    outletId = existingOutlet.id
  } else {
    const [created] = await db
      .insert(outlets)
      .values({
        googlePlaceId: details.placeId,
        name: details.name,
        formattedAddress: details.formattedAddress,
        photoUrl: details.photoUrl,
      })
      .returning()
    outletId = created.id
  }

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
