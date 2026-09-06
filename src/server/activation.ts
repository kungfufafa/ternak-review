import { and, eq, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { outlets, owners, units } from '#/db/schema'
import { hashPin, normalizePin, pinMatches } from '#/lib/pin'
import { getPlaceDetails } from './places'
import { assertRateLimit, consumeRateLimit } from './rate-limit'
import { hashRateLimitIdentifier } from './request'
import {
  normalizeReviewSettings,
  type ReviewMode,
  type ServiceTier,
} from './review'
import { getServicePackages, getServicePackage } from './service-packages'
import { isWhatsappGatewayOpen } from './whatsapp-status'

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
  const [servicePackage, servicePackages, whatsappGatewayOpen] =
    await Promise.all([
      getServicePackage(unit.serviceTier),
      getServicePackages(),
      isWhatsappGatewayOpen(),
    ])
  return {
    id: unit.id,
    publicId: unit.publicId,
    status: unit.status,
    serviceTier: unit.serviceTier as ServiceTier,
    servicePackage,
    servicePackages,
    whatsappGatewayOpen,
    reviewMode: unit.reviewMode as ReviewMode,
    ownerWhatsapp: unit.ownerWhatsapp,
    ownerId: unit.ownerId,
  }
}

export async function verifyActivationAccess(input: {
  publicId: string
  pin?: string
  sessionOwnerId?: string | null
  sessionRole?: 'ADMIN' | 'USER' | null
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
  serviceTier?: ServiceTier
  reviewMode?: ReviewMode
  ownerWhatsapp?: string
  clientKey?: string | null
  pin?: string
  sessionOwnerId?: string | null
  sessionRole?: 'ADMIN' | 'USER' | null
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
  const actor = await assertHolderMayActivate(unit, input)

  const settings = normalizeReviewSettings({
    serviceTier: input.serviceTier ?? (unit.serviceTier as ServiceTier),
    reviewMode: input.reviewMode,
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
      ownerId: unit.ownerId ?? actor.holderOwnerId,
      partnerRef,
      ...settings,
      activatedAt: new Date(),
    })
    .where(
      and(
        eq(units.id, unit.id),
        eq(units.status, 'IN_STOCK'),
        unit.ownerId ? eq(units.ownerId, unit.ownerId) : isNull(units.ownerId),
      ),
    )
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

async function rejectBadPin(publicId: string): Promise<never> {
  const limit = await consumeRateLimit(
    `pin-fail:${hashRateLimitIdentifier(publicId)}`,
    { max: 5, windowMs: 15 * 60_000 },
  )
  if (limit.limited || limit.remaining === 0) {
    throw new Error(
      'Terlalu banyak PIN yang tidak cocok. Coba lagi dalam 15 menit, atau hubungi admin untuk memeriksa pemegang dan PIN kartu.',
    )
  }
  throw new Error(
    `PIN belum cocok. Masih ${limit.remaining} kesempatan. Gunakan PIN aktivasi dari admin, bukan kode OTP untuk masuk.`,
  )
}

async function findHolderByPin(pin: string) {
  let pinHash: string
  try {
    pinHash = hashPin(normalizePin(pin))
  } catch {
    return []
  }
  return db.query.owners.findMany({
    where: and(
      eq(owners.role, 'USER'),
      eq(owners.status, 'ACTIVE'),
      eq(owners.pinHash, pinHash),
    ),
    columns: { id: true },
  })
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
  input: {
    pin?: string
    sessionOwnerId?: string | null
    sessionRole?: 'ADMIN' | 'USER' | null
  },
): Promise<{ holderOwnerId: string | null }> {
  if (input.sessionRole === 'ADMIN') {
    return { holderOwnerId: unit.ownerId }
  }
  if (unit.ownerId && unit.owner?.role === 'USER') {
    if (unit.owner.status !== 'ACTIVE') {
      throw new Error(
        'Akun pemegang dinonaktifkan. Hubungi admin untuk mengaktifkan akun sebelum memasang kartu.',
      )
    }
    if (input.sessionOwnerId && input.sessionOwnerId === unit.ownerId) {
      return { holderOwnerId: unit.ownerId }
    }
    if (!input.pin || !pinMatches(input.pin, unit.owner.pinHash)) {
      await rejectBadPin(unit.publicId)
    }
    return { holderOwnerId: unit.ownerId }
  }
  if (!input.pin && !input.sessionOwnerId && !input.sessionRole) {
    return { holderOwnerId: null }
  }
  if (!input.pin) {
    throw new Error(
      'Masukkan PIN pemegang, atau masuk sebagai admin untuk pasang tanpa PIN.',
    )
  }
  const matches = await findHolderByPin(input.pin)
  if (matches.length > 1) {
    throw new Error('PIN digunakan oleh lebih dari satu akun. Minta admin menetapkan kartu ke akunmu, lalu masuk dengan akun tersebut untuk aktivasi tanpa PIN.')
  }
  const holder = matches[0]
  if (!holder) {
    await rejectBadPin(unit.publicId)
  }
  return { holderOwnerId: holder.id }
}
