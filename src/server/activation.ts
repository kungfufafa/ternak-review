import { and, eq, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { owners, units } from '#/db/schema'
import { hashPin, normalizePin, pinMatches } from '#/lib/pin'
import { upsertOutletFromPlace } from './outlets'
import { getPlaceDetails } from './places'
import { resetUnitToStock } from './clicks'
import {
  collectProspectForUnit,
  convertProspectToSold,
  findInstalledUnitForPlace,
  getProspect,
  listReadyStockCards,
  markProspectInstalledForPlace,
  upsertProspectRecord,
} from './prospects'
import type { PlaceSuggestion } from './places'
import { assertRateLimit, clearRateLimit, consumeRateLimit } from './rate-limit'
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

/**
 * Return only activation metadata that the current viewer needs. In
 * particular, a public QR lookup must not disclose the holder's contact
 * number or ownership identifier.
 */
export async function getActivationCardForViewer(
  publicId: string,
  viewer: { ownerId: string; role: 'ADMIN' | 'USER' } | null,
) {
  const card = await getActivationCard(publicId)
  if (!card) return null
  const isAdmin = viewer?.role === 'ADMIN'
  const isHolder = viewer?.role === 'USER' && viewer.ownerId === card.ownerId
  return {
    id: card.id,
    publicId: card.publicId,
    status: card.status,
    serviceTier: card.serviceTier,
    servicePackage: card.servicePackage,
    servicePackages: card.servicePackages,
    whatsappGatewayOpen: card.whatsappGatewayOpen,
    reviewMode: card.reviewMode,
    hasOwner: Boolean(card.ownerId),
    isHolder,
    ownerWhatsapp: isAdmin || isHolder ? card.ownerWhatsapp : null,
  }
}

export async function verifyActivationAccess(input: {
  publicId: string
  pin?: string
  clientKey?: string | null
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
  installKind?: 'TRIAL' | 'SOLD'
  trialDays?: number
}) {
  const publicId = input.publicId.trim().toUpperCase()
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId),
    with: { owner: true },
  })
  if (!unit) throw new Error('Kartu tidak ditemukan.')
  if (unit.status !== 'IN_STOCK') {
    throw new Error('Kartu ini sudah terpasang ke toko.')
  }
  const actor = await assertHolderMayActivate(unit, input)

  // Do this only after the caller has proved access. Otherwise an attacker
  // can spend the shared card bucket with bad PIN submissions and block the
  // legitimate holder or admin from finishing activation. A truly public,
  // unassigned card uses the client bucket only, so abuse before assignment
  // cannot poison the later holder's card bucket.
  if (
    actor.holderOwnerId ||
    input.sessionOwnerId ||
    input.sessionRole === 'ADMIN'
  ) {
    await assertRateLimit(
      `activate-card:${hashRateLimitIdentifier(publicId)}`,
      { max: 20, windowMs: 60 * 60_000 },
    )
  }
  if (input.clientKey) {
    await assertRateLimit(`activate-client:${input.clientKey}`, {
      max: 20,
      windowMs: 60 * 60_000,
    })
  }

  const settings = normalizeReviewSettings({
    serviceTier: input.serviceTier ?? (unit.serviceTier as ServiceTier),
    reviewMode: input.reviewMode,
    ownerWhatsapp: input.ownerWhatsapp ?? unit.ownerWhatsapp,
  })

  const details = await getPlaceDetails(input.placeId)
  const outletId = await upsertOutletFromPlace(details)

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

  await upsertProspectRecord({
    googlePlaceId: details.placeId,
    name: details.name,
    formattedAddress: details.formattedAddress,
    rating: details.rating,
    userRatingCount: details.userRatingCount,
    googleMapsUri: details.googleMapsUri,
    primaryType: details.primaryType,
    partnerRef,
    createdByOwnerId: input.sessionOwnerId,
  })
  const prospect = await markProspectInstalledForPlace({
    googlePlaceId: details.placeId,
    unitId: updated.id,
    partnerRef,
    installKind: input.installKind ?? 'TRIAL',
    trialDays: input.trialDays,
  })

  return {
    unitId: updated.id,
    publicId: updated.publicId,
    outlet: details,
    partnerRef,
    prospect,
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
  let nextKind: 'TRIAL' | 'SOLD' = 'SOLD'
  if (unit.outlet?.googlePlaceId !== details.placeId) {
    const previous = await collectProspectForUnit(unit.id)
    if (previous?.installKind === 'TRIAL') nextKind = 'TRIAL'
  }
  const outletId = await upsertOutletFromPlace(details)
  await db.update(units).set({ outletId }).where(eq(units.id, unit.id))
  await upsertProspectRecord({
    googlePlaceId: details.placeId,
    name: details.name,
    formattedAddress: details.formattedAddress,
    rating: details.rating,
    userRatingCount: details.userRatingCount,
    googleMapsUri: details.googleMapsUri,
    primaryType: details.primaryType,
    partnerRef: unit.partnerRef,
  })
  await markProspectInstalledForPlace({
    googlePlaceId: details.placeId,
    unitId: unit.id,
    partnerRef: unit.partnerRef,
    installKind: nextKind,
  })
  return { outlet: details }
}

async function nextReadyPublicId(publicId?: string) {
  const requested = publicId?.trim().toUpperCase()
  if (requested) return requested
  const ready = await listReadyStockCards(1)
  const card = ready[0]
  if (!card) {
    throw new Error('Tidak ada kartu gudang. Produksi kartu dulu, lalu pasang dari sini.')
  }
  return card.publicId
}

export async function attachProspectToCard(input: {
  prospectId: string
  publicId?: string
  sessionOwnerId?: string | null
  trialDays?: number
}) {
  const prospect = await getProspect(input.prospectId)
  if (!prospect) throw new Error('Prospek tidak ditemukan.')
  if (prospect.installState === 'sold' && prospect.unitId) {
    throw new Error('Toko ini sudah closing dan kartunya masih terpasang.')
  }
  if (prospect.unitId && (prospect.installState === 'trial' || prospect.installState === 'due')) {
    throw new Error(
      prospect.installState === 'due'
        ? 'Kartu trial sudah harus diambil dulu.'
        : 'Toko ini masih trial. Ambil kartu atau closing dulu.',
    )
  }
  const occupied = await findInstalledUnitForPlace(prospect.googlePlaceId)
  if (occupied) {
    throw new Error('Toko ini sudah punya kartu terpasang.')
  }
  const result = await activateUnit({
    publicId: await nextReadyPublicId(input.publicId),
    placeId: prospect.googlePlaceId,
    partnerRef: prospect.partnerRef ?? undefined,
    sessionRole: 'ADMIN',
    sessionOwnerId: input.sessionOwnerId ?? null,
    installKind: 'TRIAL',
    trialDays: input.trialDays,
  })
  return {
    ...result,
    prospect: await getProspect(input.prospectId),
  }
}

export async function attachPlaceToCard(input: {
  place: PlaceSuggestion
  publicId?: string
  notes?: string
  partnerRef?: string
  sessionOwnerId?: string | null
  trialDays?: number
}) {
  const saved = await upsertProspectRecord({
    googlePlaceId: input.place.placeId,
    name: input.place.name,
    formattedAddress: input.place.address,
    rating: input.place.rating,
    userRatingCount: input.place.userRatingCount,
    googleMapsUri: input.place.googleMapsUri,
    primaryType: input.place.primaryType,
    notes: input.notes,
    partnerRef: input.partnerRef,
    createdByOwnerId: input.sessionOwnerId,
  })
  return attachProspectToCard({
    prospectId: saved.prospect.id,
    publicId: input.publicId,
    sessionOwnerId: input.sessionOwnerId,
    trialDays: input.trialDays,
  })
}

export async function collectProspectTrial(id: string) {
  const prospect = await getProspect(id)
  if (!prospect) throw new Error('Prospek tidak ditemukan.')
  if (prospect.installKind !== 'TRIAL' || prospect.trialCollectedAt) {
    throw new Error('Prospek ini tidak sedang trial.')
  }
  if (!prospect.unitId) {
    throw new Error('Kartu trial sudah tidak terpasang.')
  }
  const reset = await resetUnitToStock(prospect.unitId)
  if (!reset.ok) {
    throw new Error(reset.error)
  }
  const collected = await getProspect(id)
  if (!collected) throw new Error('Prospek tidak ditemukan.')
  return collected
}

export { convertProspectToSold }

const PIN_LIMIT = { max: 5, windowMs: 15 * 60_000 } as const

function pinRateLimitKey(publicId: string, clientKey?: string | null) {
  return `pin-fail:${hashRateLimitIdentifier(publicId)}:${hashRateLimitIdentifier(clientKey ?? 'server')}`
}

function rejectBadPin(limit: {
  limited: boolean
  remaining: number
}): never {
  if (limit.limited || limit.remaining === 0) {
    throw new Error(
      'Terlalu banyak PIN yang tidak cocok. Coba lagi dalam 15 menit, atau hubungi admin untuk memeriksa pemegang dan PIN kartu.',
    )
  }
  throw new Error(
    `PIN belum cocok. Masih ${limit.remaining} kesempatan. Gunakan PIN aktivasi dari admin, bukan kode OTP untuk masuk.`,
  )
}

async function reservePinAttempt(publicId: string, clientKey?: string | null) {
  const limit = await consumeRateLimit(
    pinRateLimitKey(publicId, clientKey),
    PIN_LIMIT,
  )
  if (limit.limited) {
    throw new Error(
      'Terlalu banyak PIN yang tidak cocok. Coba lagi dalam 15 menit, atau hubungi admin untuk memeriksa pemegang dan PIN kartu.',
    )
  }
  return limit
}

async function clearSuccessfulPinAttempt(
  publicId: string,
  clientKey?: string | null,
) {
  await clearRateLimit(pinRateLimitKey(publicId, clientKey), {
    windowMs: PIN_LIMIT.windowMs,
  })
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
    clientKey?: string | null
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
    if (!input.pin) {
      throw new Error(
        'Masukkan PIN pemegang, atau masuk sebagai admin untuk pasang tanpa PIN.',
      )
    }
    const limit = await reservePinAttempt(unit.publicId, input.clientKey)
    if (!pinMatches(input.pin, unit.owner.pinHash)) {
      rejectBadPin(limit)
    }
    await clearSuccessfulPinAttempt(unit.publicId, input.clientKey)
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
  const limit = await reservePinAttempt(unit.publicId, input.clientKey)
  const matches = await findHolderByPin(input.pin)
  if (matches.length > 1) {
    throw new Error('PIN digunakan oleh lebih dari satu akun. Minta admin menetapkan kartu ke akunmu, lalu masuk dengan akun tersebut untuk aktivasi tanpa PIN.')
  }
  const holder = matches[0]
  if (!holder) {
    rejectBadPin(limit)
  }
  await clearSuccessfulPinAttempt(unit.publicId, input.clientKey)
  return { holderOwnerId: holder.id }
}
