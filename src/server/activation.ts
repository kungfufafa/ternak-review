import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { outlets, units } from '#/db/schema'
import { pinMatches } from '#/lib/pin'
import { getPlaceDetails } from './places'
import { assertRateLimit, consumeRateLimit } from './rate-limit'
import { hashRateLimitIdentifier } from './request'
import {
  normalizeReviewSettings,
  type ReviewMode,
  type ServiceTier,
} from './review'
import { getServicePackage } from './service-packages'

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
  const servicePackage = await getServicePackage(unit.serviceTier)
  return {
    id: unit.id,
    publicId: unit.publicId,
    status: unit.status,
    serviceTier: unit.serviceTier as ServiceTier,
    servicePackage,
    reviewMode: unit.reviewMode as ReviewMode,
    ownerWhatsapp: unit.ownerWhatsapp,
    ownerId: unit.ownerId,
  }
}

export async function verifyActivationAccess(input: {
  publicId: string
  pin?: string
  sessionOwnerId?: string | null
}) {
  const publicId = input.publicId.trim().toUpperCase()
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId),
    with: { owner: true },
  })
  if (!unit || unit.status !== 'IN_STOCK') {
    throw new Error('Kartu tidak tersedia untuk aktivasi.')
  }
  await assertHolderMayActivate(unit, input)
  return { ok: true as const, publicId: unit.publicId }
}

export async function activateUnit(input: {
  publicId: string
  placeId: string
  partnerRef?: string
  reviewMode?: ReviewMode
  ownerWhatsapp?: string
  clientKey?: string | null
  pin?: string
  sessionOwnerId?: string | null
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
    with: { owner: true },
  })
  if (!unit) throw new Error('Kartu tidak ditemukan.')
  if (unit.status !== 'IN_STOCK') {
    throw new Error('Kartu ini sudah terpasang ke toko.')
  }
  await assertHolderMayActivate(unit, input)

  const settings = normalizeReviewSettings({
    serviceTier: unit.serviceTier as ServiceTier,
    reviewMode: input.reviewMode ?? (unit.reviewMode as ReviewMode),
    ownerWhatsapp: input.ownerWhatsapp ?? unit.ownerWhatsapp,
  })

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
      partnerRef,
      ...settings,
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

export async function rebindUnitOutlet(input: {
  unitId: string
  placeId: string
  actorOwnerId?: string | null
  asAdmin?: boolean
}) {
  const unit = await db.query.units.findFirst({
    where: eq(units.id, input.unitId),
    with: { outlet: true },
  })
  if (!unit) throw new Error('Kartu tidak ditemukan.')
  if (unit.status === 'IN_STOCK') {
    throw new Error('Kartu belum dipasang ke toko.')
  }
  if (!input.asAdmin && unit.ownerId !== input.actorOwnerId) {
    throw new Error('Kartu ini bukan punya akunmu.')
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
  if (!outlet) throw new Error('Gagal menyimpan toko.')
  await db.update(units).set({ outletId: outlet.id }).where(eq(units.id, unit.id))
  return { outlet: details }
}

async function assertHolderMayActivate(
  unit: {
    publicId: string
    ownerId: string | null
    owner: {
      id: string
      role: string
      status: string
      pinHash: string | null
    } | null
  },
  input: { pin?: string; sessionOwnerId?: string | null },
) {
  if (!unit.ownerId || !unit.owner || unit.owner.role !== 'USER') {
    throw new Error(
      'Kartu ini belum disiapkan. Minta penjual memasangkannya ke akunmu, atau masuk kalau akunmu sudah ada.',
    )
  }
  if (unit.owner.status !== 'ACTIVE') {
    throw new Error(
      'Akun pemegang sedang istirahat. Hubungi penjual supaya diaktifkan lagi.',
    )
  }
  if (input.sessionOwnerId && input.sessionOwnerId === unit.ownerId) {
    return
  }
  if (!input.pin || !pinMatches(input.pin, unit.owner.pinHash)) {
    const limit = await consumeRateLimit(
      `pin-fail:${hashRateLimitIdentifier(unit.publicId)}`,
      { max: 5, windowMs: 15 * 60_000 },
    )
    if (limit.limited || limit.remaining === 0) {
      throw new Error(
        'Terlalu banyak PIN yang tidak cocok. Istirahat sebentar, atau masuk dashboard supaya tidak perlu PIN.',
      )
    }
    throw new Error(
      `PIN belum cocok. Masih ${limit.remaining} kesempatan. Kalau ini kartumu, masuk dashboard biar langsung pasang.`,
    )
  }
}
