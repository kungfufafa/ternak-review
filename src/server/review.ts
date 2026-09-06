import { and, desc, eq, lt, or } from 'drizzle-orm'
import { db } from '#/db'
import { reviewFeedbacks, units } from '#/db/schema'
import {
  liveReviewMode,
  packageNeedsOwnerWhatsapp,
  PRO_NEEDS_GATEWAY,
  ratingRangeLabel,
  reviewModeForPackage,
  type ReviewMode,
  type ServiceTier,
} from '#/lib/review-settings'
import { getServicePackage } from './service-packages'
import { isWhatsappGatewayOpen } from './whatsapp-status'

export { modeAllowed } from '#/lib/review-settings'
export type { ReviewMode, ServiceTier } from '#/lib/review-settings'
export type FeedbackStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNCERTAIN'

export function googleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

export function normalizeWhatsapp(raw?: string | null) {
  const value = raw?.trim() ?? ''
  if (!value) return null
  const digits = value.replace(/[\s().-]/g, '').replace(/^\+/, '')
  const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits
  if (!/^628\d{7,12}$/.test(normalized)) return null
  return normalized
}

export function normalizeReviewSettings(input: {
  serviceTier: ServiceTier
  reviewMode?: ReviewMode
  ownerWhatsapp?: string | null
  whatsappGatewayOpen: boolean
  requireLivePro?: boolean
}) {
  const { serviceTier } = input
  if (
    input.requireLivePro &&
    serviceTier === 'PRO' &&
    !input.whatsappGatewayOpen
  ) {
    throw new Error(PRO_NEEDS_GATEWAY)
  }
  const reviewMode = reviewModeForPackage(serviceTier)
  const ownerWhatsapp = packageNeedsOwnerWhatsapp(serviceTier)
    ? normalizeWhatsapp(input.ownerWhatsapp)
    : null
  if (packageNeedsOwnerWhatsapp(serviceTier) && !ownerWhatsapp) {
    throw new Error(
      'Nomor WhatsApp owner wajib diisi untuk Plus/Pro. Tamu tidak melihat nomor ini.',
    )
  }
  return { serviceTier, reviewMode, ownerWhatsapp }
}

async function liveModeForUnit(unit: {
  serviceTier: string
  ownerWhatsapp?: string | null
}) {
  return liveReviewMode(
    unit.serviceTier as ServiceTier,
    await isWhatsappGatewayOpen(),
    Boolean(normalizeWhatsapp(unit.ownerWhatsapp)),
  )
}

export async function getPublicFeedbackCard(publicId: string) {
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId.trim().toUpperCase()),
    with: { outlet: true },
  })
  if (!unit || unit.status !== 'ACTIVE' || !unit.outlet?.googlePlaceId) {
    return null
  }
  const reviewMode = await liveModeForUnit(unit)
  if (reviewMode === 'GOOGLE_DIRECT') return null
  const servicePackage = await getServicePackage(unit.serviceTier)
  return {
    publicId: unit.publicId,
    reviewMode,
    serviceTier: unit.serviceTier as ServiceTier,
    interceptMaxRating: servicePackage.interceptMaxRating,
    outletName: unit.outlet.name,
    address: unit.outlet.formattedAddress,
    googleReviewUrl: googleReviewUrl(unit.outlet.googlePlaceId),
  }
}

async function getActiveUnit(publicId: string) {
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId.trim().toUpperCase()),
    with: { outlet: true },
  })
  if (!unit || unit.status !== 'ACTIVE' || !unit.outlet?.googlePlaceId) {
    throw new Error('Kartu tidak aktif.')
  }
  return unit
}

export async function resolveFeedbackDestination(input: {
  publicId: string
  rating: number
}) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error('Rating harus antara 1 dan 5.')
  }
  const unit = await getActiveUnit(input.publicId)
  const servicePackage = await getServicePackage(unit.serviceTier)
  const reviewUrl = googleReviewUrl(unit.outlet!.googlePlaceId)
  const reviewMode = await liveModeForUnit(unit)
  if (
    reviewMode === 'GOOGLE_DIRECT' ||
    input.rating > servicePackage.interceptMaxRating
  ) {
    return { kind: 'google' as const, url: reviewUrl }
  }
  if (reviewMode === 'OWNER_WHATSAPP') {
    const phone = normalizeWhatsapp(unit.ownerWhatsapp)
    if (!phone) throw new Error('Nomor WhatsApp owner belum siap.')
    const text = `Halo, saya ingin menyampaikan masukan untuk ${unit.outlet!.name}. Rating: ${input.rating}/5.`
    return {
      kind: 'owner_whatsapp' as const,
      url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
    }
  }
  return {
    kind: 'anonymous' as const,
    interceptMaxRating: servicePackage.interceptMaxRating,
  }
}

export function feedbackMessage(input: {
  outletName: string
  rating: number
  message: string
}) {
  return [
    `Masukan baru untuk ${input.outletName}`,
    `Rating: ${input.rating}/5`,
    '',
    input.message,
  ].join('\n')
}

export async function submitAnonymousFeedback(input: {
  publicId: string
  rating: number
  message: string
  submissionId: string
}) {
  const message = input.message.trim()
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error('Rating harus antara 1 dan 5.')
  }
  if (message.length < 1 || message.length > 2000) {
    throw new Error('Masukan wajib diisi, maksimal 2.000 karakter.')
  }
  const unit = await getActiveUnit(input.publicId)
  const servicePackage = await getServicePackage(unit.serviceTier)
  if ((await liveModeForUnit(unit)) !== 'ANONYMOUS_WHATSAPP') {
    throw new Error(
      'Mode anonim tidak aktif. WhatsApp platform harus OPEN, atau pilih jalur lain.',
    )
  }
  if (input.rating > servicePackage.interceptMaxRating) {
    throw new Error(
      `Masukan anonim hanya untuk rating ${ratingRangeLabel(servicePackage.interceptMaxRating)}. Silakan pilih rating kembali.`,
    )
  }
  const ownerWhatsapp = normalizeWhatsapp(unit.ownerWhatsapp)
  if (!ownerWhatsapp) throw new Error('Nomor WhatsApp owner belum siap.')

  const now = new Date()
  await db
    .insert(reviewFeedbacks)
    .values({
      id: input.submissionId,
      unitId: unit.id,
      rating: input.rating,
      message: feedbackMessage({
        outletName: unit.outlet!.name,
        rating: input.rating,
        message,
      }),
      ownerWhatsapp,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: reviewFeedbacks.id })

  const row = await db.query.reviewFeedbacks.findFirst({
    where: eq(reviewFeedbacks.id, input.submissionId),
  })
  if (!row) throw new Error('Masukan gagal disimpan.')
  if (row.unitId !== unit.id || row.rating !== input.rating || row.message !== feedbackMessage({
    outletName: unit.outlet!.name,
    rating: input.rating,
    message,
  })) {
    throw new Error('ID masukan sudah dipakai.')
  }
  return { id: row.id, status: row.status as FeedbackStatus }
}

export async function listUnitFeedback(unitId: string) {
  const rows = await db.query.reviewFeedbacks.findMany({
    where: eq(reviewFeedbacks.unitId, unitId),
    orderBy: [desc(reviewFeedbacks.createdAt)],
    limit: 100,
  })
  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    message: row.message,
    status: row.status as FeedbackStatus,
    attempts: row.attempts,
    gatewayMessageId: row.gatewayMessageId,
    deliveryError: row.deliveryError,
    createdAt: row.createdAt?.getTime() ?? null,
    submittedAt: row.submittedAt?.getTime() ?? null,
    deliveredAt: row.deliveredAt?.getTime() ?? null,
  }))
}

export async function updateUnitReviewSettings(input: {
  unitId: string
  serviceTier: ServiceTier
  reviewMode?: ReviewMode
  ownerWhatsapp?: string | null
}) {
  const unit = await db.query.units.findFirst({ where: eq(units.id, input.unitId) })
  if (!unit) return { ok: false as const, error: 'Kartu tidak ditemukan.' }
  const settings = normalizeReviewSettings({
    ...input,
    whatsappGatewayOpen: await isWhatsappGatewayOpen(),
  })
  await db
    .update(units)
    .set(settings)
    .where(eq(units.id, input.unitId))
  return { ok: true as const, ...settings }
}

export async function retryFeedback(feedbackId: string) {
  const [row] = await db
    .update(reviewFeedbacks)
    .set({
      status: 'QUEUED',
      leaseUntil: null,
      deliveryError: null,
      updatedAt: new Date(),
    })
    .where(eq(reviewFeedbacks.id, feedbackId))
    .returning({ id: reviewFeedbacks.id })
  return Boolean(row)
}

export async function claimFeedbackJob(now = new Date()) {
  const leaseUntil = new Date(now.getTime() + 120_000)
  const candidate = await db.query.reviewFeedbacks.findFirst({
    where: or(
      eq(reviewFeedbacks.status, 'QUEUED'),
      and(
        eq(reviewFeedbacks.status, 'PROCESSING'),
        lt(reviewFeedbacks.leaseUntil, now),
      ),
    ),
    orderBy: [reviewFeedbacks.createdAt],
  })
  if (!candidate) return null
  const [claimed] = await db
    .update(reviewFeedbacks)
    .set({
      status: 'PROCESSING',
      leaseUntil,
      attempts: candidate.attempts + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviewFeedbacks.id, candidate.id),
        or(
          eq(reviewFeedbacks.status, 'QUEUED'),
          and(
            eq(reviewFeedbacks.status, 'PROCESSING'),
            lt(reviewFeedbacks.leaseUntil, now),
          ),
        ),
      ),
    )
    .returning()
  return claimed ?? null
}

export async function applyFeedbackDelivery(input: {
  id: string
  status: 'SUBMITTED' | 'DELIVERED' | 'FAILED' | 'UNCERTAIN'
  messageId?: string | null
  error?: string | null
}) {
  const now = new Date()
  const values = {
    status: input.status,
    gatewayMessageId: input.messageId ?? undefined,
    deliveryError: input.error?.slice(0, 500) ?? null,
    leaseUntil: null,
    updatedAt: now,
    submittedAt: input.status === 'SUBMITTED' ? now : undefined,
    deliveredAt: input.status === 'DELIVERED' ? now : undefined,
  }
  await db.update(reviewFeedbacks).set(values).where(eq(reviewFeedbacks.id, input.id))
}
