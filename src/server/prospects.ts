import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import { prospects, units } from '#/db/schema'
import {
  closingBand,
  closingHint,
  formatPlaceRating,
  type ProspectStatus,
} from '#/lib/place-rating'
import { getPlaceDetails, type PlaceSuggestion } from '#/server/places'

const DEFAULT_PAGE_SIZE = 20

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
  createdAt: Date
  updatedAt: Date
}) {
  const snapshot = {
    rating: row.rating,
    userRatingCount: row.userRatingCount,
  }
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
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
    ratingLabel: formatPlaceRating(snapshot),
    closingBand: closingBand(snapshot),
    closingHint: closingHint(snapshot),
  }
}

export async function markProspectWonForPlace(input: {
  googlePlaceId: string
  unitId: string
  partnerRef?: string | null
}) {
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.googlePlaceId, input.googlePlaceId),
  })
  if (!existing) return null
  const now = new Date()
  const [updated] = await db
    .update(prospects)
    .set({
      status: 'WON',
      unitId: input.unitId,
      partnerRef: existing.partnerRef ?? input.partnerRef ?? null,
      updatedAt: now,
    })
    .where(eq(prospects.id, existing.id))
    .returning()
  return updated ? serializeProspect(updated) : null
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

export async function listProspects(input?: {
  q?: string
  status?: ProspectStatus
  partner?: string
  page?: number
  pageSize?: number
  sort?: 'reviews' | 'rating' | 'recent'
}) {
  const pageSize = Math.min(Math.max(input?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100)
  const page = Math.max(input?.page ?? 1, 1)
  const needle = searchNeedle(input?.q)
  const partner = input?.partner?.trim() || undefined
  const filters = []
  if (input?.status) filters.push(eq(prospects.status, input.status))
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

  const [totalRow] = await db
    .select({ total: count() })
    .from(prospects)
    .where(where)
  const total = Number(totalRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  if (total === 0) {
    return { prospects: [], total: 0, page: 1, pageSize, pageCount: 1 }
  }

  const sort = input?.sort ?? 'reviews'
  const orderBy =
    sort === 'rating'
      ? [asc(sql`coalesce(${prospects.rating}, 99)`), desc(prospects.createdAt)]
      : sort === 'recent'
        ? [desc(prospects.createdAt)]
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
    prospects: rows.map(serializeProspect),
    total,
    page: safePage,
    pageSize,
    pageCount,
  }
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
