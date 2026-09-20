import { and, asc, count, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import { prospects, units } from '#/db/schema'
import {
  closingBand,
  closingHint,
  DEFAULT_TRIAL_DAYS,
  formatPlaceRating,
  prospectInstallState,
  trialEndsAt,
  trialPickupLabel,
  type ProspectInstallKind,
  type ProspectInstallState,
  type ProspectStatus,
} from '#/lib/place-rating'
import { getPlaceDetails, type PlaceSuggestion } from '#/server/places'

const DEFAULT_PAGE_SIZE = 20

export type ProspectInstallFilter = ProspectInstallState

function stamp(value: Date | null | undefined) {
  return value ? value.getTime() : null
}

function searchNeedle(q?: string) {
  const value = q?.trim().toLowerCase()
  return value && value.length > 0 ? value : null
}

export function serializeProspect(row: {
  id: string
  googlePlaceId: string
  name: string
  formattedAddress: string | null
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  primaryType: string | null
  notes: string | null
  status: string
  partnerRef: string | null
  unitId: string | null
  installKind?: string | null
  trialStartedAt?: Date | null
  trialEndsAt?: Date | null
  trialCollectedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}, now = Date.now()) {
  const snapshot = {
    rating: row.rating,
    userRatingCount: row.userRatingCount,
  }
  const trialStartedAt = stamp(row.trialStartedAt)
  const trialEndsAtMs = stamp(row.trialEndsAt)
  const trialCollectedAt = stamp(row.trialCollectedAt)
  const installKind = (row.installKind ?? 'NONE') as ProspectInstallKind
  const installState = prospectInstallState(
    {
      installKind,
      trialEndsAt: row.trialEndsAt,
      trialCollectedAt: row.trialCollectedAt,
      unitId: row.unitId,
      status: row.status,
    },
    now,
  )
  return {
    id: row.id,
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    formattedAddress: row.formattedAddress,
    rating: row.rating,
    userRatingCount: row.userRatingCount,
    googleMapsUri: row.googleMapsUri,
    primaryType: row.primaryType,
    notes: row.notes,
    status: row.status as ProspectStatus,
    partnerRef: row.partnerRef,
    unitId: row.unitId,
    installKind,
    installState,
    trialStartedAt,
    trialEndsAt: trialEndsAtMs,
    trialCollectedAt,
    pickupLabel: trialPickupLabel(trialEndsAtMs, now),
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
    ratingLabel: formatPlaceRating(snapshot),
    closingBand: closingBand(snapshot),
    closingHint: closingHint(snapshot),
  }
}

export async function markProspectInstalledForPlace(input: {
  googlePlaceId: string
  unitId: string
  partnerRef?: string | null
  installKind?: ProspectInstallKind
  trialDays?: number
  now?: Date
}) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.googlePlaceId, input.googlePlaceId),
  })
  if (!existing) return null
  const now = input.now ?? new Date()
  const installKind = input.installKind ?? 'SOLD'
  const days = input.trialDays ?? DEFAULT_TRIAL_DAYS
  const startingTrial = installKind === 'TRIAL'
  const [updated] = await db
    .update(prospects)
    .set({
      status: startingTrial
        ? existing.status === 'LOST'
          ? 'CONTACTED'
          : existing.status === 'WON'
            ? 'CONTACTED'
            : existing.status === 'NEW'
              ? 'CONTACTED'
              : existing.status
        : 'WON',
      unitId: input.unitId,
      partnerRef: existing.partnerRef ?? input.partnerRef ?? null,
      installKind,
      trialStartedAt: startingTrial ? now : existing.trialStartedAt,
      trialEndsAt: startingTrial ? trialEndsAt(now, days) : existing.trialEndsAt,
      trialCollectedAt: startingTrial ? null : existing.trialCollectedAt,
      updatedAt: now,
    })
    .where(eq(prospects.id, existing.id))
    .returning()
  return updated ? serializeProspect(updated, now.getTime()) : null
}

export async function markProspectWonForPlace(input: {
  googlePlaceId: string
  unitId: string
  partnerRef?: string | null
}) {
  return markProspectInstalledForPlace({
    ...input,
    installKind: 'SOLD',
  })
}

export async function collectProspectForUnit(unitId: string, now = new Date()) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.unitId, unitId),
  })
  if (!existing) return null
  const collectingTrial = existing.installKind === 'TRIAL'
  const [updated] = await db
    .update(prospects)
    .set({
      unitId: null,
      trialCollectedAt: collectingTrial ? now : existing.trialCollectedAt,
      updatedAt: now,
    })
    .where(eq(prospects.id, existing.id))
    .returning()
  return updated ? serializeProspect(updated, now.getTime()) : null
}

export async function convertProspectToSold(id: string, now = new Date()) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.id, id),
  })
  if (!existing) throw new Error('Prospek tidak ditemukan.')
  const state = prospectInstallState(existing, now.getTime())
  if (state !== 'trial' && state !== 'due') {
    throw new Error('Hanya toko yang sedang trial yang bisa di-closing.')
  }
  if (!existing.unitId) {
    throw new Error('Kartu trial sudah tidak terpasang.')
  }
  const [updated] = await db
    .update(prospects)
    .set({
      status: 'WON',
      installKind: 'SOLD',
      updatedAt: now,
    })
    .where(eq(prospects.id, existing.id))
    .returning()
  if (!updated) throw new Error('Gagal menyimpan closing.')
  return serializeProspect(updated, now.getTime())
}

export async function upsertProspectRecord(input: {
  googlePlaceId: string
  name: string
  formattedAddress: string | null
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  primaryType: string | null
  notes?: string | null
  partnerRef?: string | null
  createdByOwnerId?: string | null
}) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.googlePlaceId, input.googlePlaceId),
  })
  const now = new Date()
  const notes = input.notes?.trim().slice(0, 500) || null
  const partnerRef = input.partnerRef?.trim().slice(0, 80) || null

  if (existing) {
    const keepSnapshot = existing.rating != null || existing.userRatingCount != null
    const [updated] = await db
      .update(prospects)
      .set({
        name: input.name,
        formattedAddress: input.formattedAddress,
        googleMapsUri: input.googleMapsUri,
        primaryType: input.primaryType,
        notes: notes ?? existing.notes,
        partnerRef: partnerRef ?? existing.partnerRef,
        rating: keepSnapshot ? existing.rating : input.rating,
        userRatingCount: keepSnapshot
          ? existing.userRatingCount
          : input.userRatingCount,
        updatedAt: now,
      })
      .where(eq(prospects.id, existing.id))
      .returning()
    if (!updated) throw new Error('Gagal memperbarui prospek.')
    return { prospect: serializeProspect(updated), created: false as const }
  }

  const [created] = await db
    .insert(prospects)
    .values({
      googlePlaceId: input.googlePlaceId,
      name: input.name,
      formattedAddress: input.formattedAddress,
      rating: input.rating,
      userRatingCount: input.userRatingCount,
      googleMapsUri: input.googleMapsUri,
      primaryType: input.primaryType,
      notes,
      partnerRef,
      createdByOwnerId: input.createdByOwnerId ?? null,
    })
    .returning()
  if (!created) throw new Error('Gagal menyimpan prospek.')
  return { prospect: serializeProspect(created), created: true as const }
}

export async function saveProspect(input: {
  placeId: string
  notes?: string
  partnerRef?: string
  createdByOwnerId?: string | null
}) {
  const details = await getPlaceDetails(input.placeId)
  return upsertProspectRecord({
    googlePlaceId: details.placeId,
    name: details.name,
    formattedAddress: details.formattedAddress,
    rating: details.rating,
    userRatingCount: details.userRatingCount,
    googleMapsUri: details.googleMapsUri,
    primaryType: details.primaryType,
    notes: input.notes,
    partnerRef: input.partnerRef,
    createdByOwnerId: input.createdByOwnerId,
  })
}

export async function saveProspectBatch(input: {
  places: PlaceSuggestion[]
  notes?: string
  partnerRef?: string
  createdByOwnerId?: string | null
}) {
  const unique = new Map<string, PlaceSuggestion>()
  for (const place of input.places) {
    if (!place.placeId || !place.name.trim()) continue
    unique.set(place.placeId, place)
  }
  if (unique.size === 0) {
    throw new Error('Tidak ada toko potensial untuk disimpan.')
  }
  if (unique.size > 40) {
    throw new Error('Maksimal 40 toko per sekali simpan.')
  }
  let created = 0
  let existing = 0
  const saved = []
  for (const place of unique.values()) {
    const result = await upsertProspectRecord({
      googlePlaceId: place.placeId,
      name: place.name,
      formattedAddress: place.address,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      googleMapsUri: place.googleMapsUri,
      primaryType: place.primaryType,
      notes: input.notes,
      partnerRef: input.partnerRef,
      createdByOwnerId: input.createdByOwnerId,
    })
    if (result.created) created += 1
    else existing += 1
    saved.push(result.prospect)
  }
  return { created, existing, prospects: saved }
}

function installFilter(install: ProspectInstallFilter | undefined, now: Date) {
  if (!install) return undefined
  if (install === 'sold') {
    return or(eq(prospects.installKind, 'SOLD'), eq(prospects.status, 'WON'))
  }
  if (install === 'collected') {
    return and(eq(prospects.installKind, 'TRIAL'), isNotNull(prospects.trialCollectedAt))
  }
  if (install === 'due') {
    return and(
      eq(prospects.installKind, 'TRIAL'),
      isNull(prospects.trialCollectedAt),
      lte(prospects.trialEndsAt, now),
    )
  }
  if (install === 'trial') {
    return and(
      eq(prospects.installKind, 'TRIAL'),
      isNull(prospects.trialCollectedAt),
      or(isNull(prospects.trialEndsAt), gt(prospects.trialEndsAt, now)),
    )
  }
  return or(
    eq(prospects.installKind, 'NONE'),
    and(eq(prospects.installKind, 'TRIAL'), isNotNull(prospects.trialCollectedAt)),
  )
}

async function summarizeProspectInstalls(now = Date.now()) {
  const rows = await db
    .select({
      installKind: prospects.installKind,
      trialEndsAt: prospects.trialEndsAt,
      trialCollectedAt: prospects.trialCollectedAt,
      unitId: prospects.unitId,
      status: prospects.status,
    })
    .from(prospects)
  const summary = {
    none: 0,
    trial: 0,
    due: 0,
    collected: 0,
    sold: 0,
  } satisfies Record<ProspectInstallState, number>
  for (const row of rows) {
    summary[prospectInstallState(row, now)] += 1
  }
  return summary
}

export async function listProspects(input?: {
  q?: string
  status?: ProspectStatus
  install?: ProspectInstallFilter
  partner?: string
  page?: number
  pageSize?: number
  sort?: 'reviews' | 'rating' | 'recent' | 'pickup'
}) {
  const pageSize = Math.min(Math.max(input?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100)
  const page = Math.max(input?.page ?? 1, 1)
  const needle = searchNeedle(input?.q)
  const partner = input?.partner?.trim() || undefined
  const now = new Date()
  const filters = []
  if (input?.status) filters.push(eq(prospects.status, input.status))
  const installWhere = installFilter(input?.install, now)
  if (installWhere) filters.push(installWhere)
  if (partner) filters.push(eq(prospects.partnerRef, partner))
  if (needle) {
    const pattern = `%${needle}%`
    filters.push(
      or(
        sql`lower(${prospects.name}) like ${pattern}`,
        sql`lower(coalesce(${prospects.formattedAddress}, '')) like ${pattern}`,
        sql`lower(coalesce(${prospects.partnerRef}, '')) like ${pattern}`,
      ),
    )
  }
  const where = filters.length ? and(...filters) : undefined

  const [[totalRow], summary] = await Promise.all([
    db.select({ total: count() }).from(prospects).where(where),
    summarizeProspectInstalls(now.getTime()),
  ])
  const total = Number(totalRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  if (total === 0) {
    return { prospects: [], total: 0, page: 1, pageSize, pageCount: 1, summary }
  }

  const sort = input?.sort ?? (input?.install === 'due' ? 'pickup' : 'reviews')
  const orderBy =
    sort === 'rating'
      ? [asc(sql`coalesce(${prospects.rating}, 99)`), desc(prospects.createdAt)]
      : sort === 'recent'
        ? [desc(prospects.createdAt)]
        : sort === 'pickup'
          ? [
              asc(sql`coalesce(${prospects.trialEndsAt}, 9999999999999)`),
              desc(prospects.createdAt),
            ]
          : [
              asc(sql`coalesce(${prospects.userRatingCount}, -1)`),
              asc(sql`coalesce(${prospects.rating}, 99)`),
              desc(prospects.createdAt),
            ]

  const rows = await db
    .select()
    .from(prospects)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((safePage - 1) * pageSize)

  return {
    prospects: rows.map((row) => serializeProspect(row, now.getTime())),
    total,
    page: safePage,
    pageSize,
    pageCount,
    summary,
  }
}

export async function listProspectInstalls(now = Date.now()) {
  const rows = await db
    .select({
      id: prospects.id,
      googlePlaceId: prospects.googlePlaceId,
      name: prospects.name,
      status: prospects.status,
      installKind: prospects.installKind,
      trialStartedAt: prospects.trialStartedAt,
      trialEndsAt: prospects.trialEndsAt,
      trialCollectedAt: prospects.trialCollectedAt,
      unitId: prospects.unitId,
    })
    .from(prospects)
  return rows.map((row) => {
    const serialized = serializeProspect(
      {
        ...row,
        formattedAddress: null,
        rating: null,
        userRatingCount: null,
        googleMapsUri: null,
        primaryType: null,
        notes: null,
        partnerRef: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      now,
    )
    return {
      id: serialized.id,
      googlePlaceId: serialized.googlePlaceId,
      name: serialized.name,
      status: serialized.status,
      installKind: serialized.installKind,
      installState: serialized.installState,
      trialStartedAt: serialized.trialStartedAt,
      trialEndsAt: serialized.trialEndsAt,
      trialCollectedAt: serialized.trialCollectedAt,
      pickupLabel: serialized.pickupLabel,
      unitId: serialized.unitId,
    }
  })
}

export async function updateProspect(input: {
  id: string
  status?: ProspectStatus
  notes?: string
  partnerRef?: string
}) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.id, input.id),
  })
  if (!existing) throw new Error('Prospek tidak ditemukan.')
  const now = new Date()
  const [updated] = await db
    .update(prospects)
    .set({
      status: input.status ?? existing.status,
      notes:
        input.notes !== undefined
          ? input.notes.trim().slice(0, 500) || null
          : existing.notes,
      partnerRef:
        input.partnerRef !== undefined
          ? input.partnerRef.trim().slice(0, 80) || null
          : existing.partnerRef,
      updatedAt: now,
    })
    .where(eq(prospects.id, existing.id))
    .returning()
  if (!updated) throw new Error('Gagal menyimpan prospek.')
  return serializeProspect(updated)
}

export async function deleteProspect(id: string) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.id, id),
  })
  if (!existing) throw new Error('Prospek tidak ditemukan.')
  await db.delete(prospects).where(eq(prospects.id, id))
  return { ok: true as const }
}

export async function listReadyStockCards(limit = 12) {
  const rows = await db.query.units.findMany({
    where: eq(units.status, 'IN_STOCK'),
    columns: {
      id: true,
      publicId: true,
      serviceTier: true,
    },
    with: {
      batch: { columns: { label: true } },
    },
    orderBy: [desc(units.createdAt)],
    limit: Math.min(Math.max(limit, 1), 40),
  })
  return rows.map((row) => ({
    id: row.id,
    publicId: row.publicId,
    serviceTier: row.serviceTier,
    batchLabel: row.batch?.label ?? null,
  }))
}

export async function getProspect(id: string) {
  const row = await db.query.prospects.findFirst({
    where: eq(prospects.id, id),
  })
  return row ? serializeProspect(row) : null
}
