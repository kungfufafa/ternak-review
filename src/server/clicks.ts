import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNotNull,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import { clicks, outlets, stockBatches, units } from '#/db/schema'
import { sqlDayBucket } from '#/db/sql'
import { getAppUrl } from '#/lib/env'
import {
  REPORTING_TIME_ZONE,
  reportingDayKey,
  reportingDayStart,
  reportingMonthStart,
  shiftReportingDay,
} from '#/lib/reporting-time'
import { listUnitFeedback } from './review'
import { getServicePackages } from './service-packages'

export type UnitStatus = 'IN_STOCK' | 'ACTIVE' | 'INACTIVE'

const DEFAULT_PAGE_SIZE = 20

function searchNeedle(q?: string) {
  return (q ?? '').trim().toLowerCase().replace(/[%_]/g, '')
}

function stamp(value: Date | number | null | undefined) {
  if (value == null) return null
  return value instanceof Date ? value.getTime() : Number(value)
}

export async function getAdminDashboardSummary() {
  const generatedAt = Date.now()
  const monthStart = reportingMonthStart(generatedAt)

  const [clickRow] = await db
    .select({ total: count() })
    .from(clicks)
    .where(gte(clicks.at, monthStart))

  const clickBuckets = await getDailyClicks(15, generatedAt)

  const [unitCountRow] = await db.select({ total: count() }).from(units)
  const [activeRow] = await db
    .select({ total: count() })
    .from(units)
    .where(eq(units.status, 'ACTIVE'))
  const [activeOutletRow] = await db
    .select({ total: countDistinct(units.outletId) })
    .from(units)
    .where(and(eq(units.status, 'ACTIVE'), isNotNull(units.outletId)))
  const [stockRow] = await db
    .select({
      total: count(),
      ready: count(units.nfcEncodedAt),
    })
    .from(units)
    .where(eq(units.status, 'IN_STOCK'))
  const [inactiveRow] = await db
    .select({ total: count() })
    .from(units)
    .where(eq(units.status, 'INACTIVE'))

  const recent = await db.query.units.findMany({
    where: eq(units.status, 'ACTIVE'),
    with: { outlet: true },
    orderBy: [desc(units.activatedAt)],
    limit: 8,
  })

  const {
    clicksToday,
    clicksLast7Days,
    clicksPrevious7Days,
    daily,
  } = summarizeClickBuckets(clickBuckets)

  return {
    generatedAt,
    reportingTimeZone: REPORTING_TIME_ZONE,
    unitCount: Number(unitCountRow?.total ?? 0),
    activeCount: Number(activeRow?.total ?? 0),
    activeOutletCount: Number(activeOutletRow?.total ?? 0),
    stockCount: Number(stockRow?.total ?? 0),
    readyStockCount: Number(stockRow?.ready ?? 0),
    inactiveCount: Number(inactiveRow?.total ?? 0),
    clicksThisMonth: Number(clickRow?.total ?? 0),
    clicksToday,
    clicksLast7Days,
    clicksPrevious7Days,
    recentStores: recent
      .filter((unit) => unit.outlet?.name)
      .map((unit) => ({
        id: unit.id,
        publicId: unit.publicId,
        partnerRef: unit.partnerRef,
        activatedAt: stamp(unit.activatedAt),
        outletName: unit.outlet?.name ?? null,
      })),
    daily,
  }
}

export async function listUnits(input?: {
  q?: string
  status?: UnitStatus
  partner?: string
  batchId?: string
  page?: number
  pageSize?: number
}) {
  const pageSize = Math.min(
    Math.max(input?.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    100,
  )
  const page = Math.max(input?.page ?? 1, 1)
  const needle = searchNeedle(input?.q)
  const partner = input?.partner?.trim() || undefined
  const batchId = input?.batchId?.trim() || undefined

  const filters = []
  if (input?.status) filters.push(eq(units.status, input.status))
  if (partner) filters.push(eq(units.partnerRef, partner))
  if (batchId) filters.push(eq(units.batchId, batchId))
  if (needle) {
    const pattern = `%${needle}%`
    filters.push(
      or(
        sql`lower(${units.publicId}) like ${pattern}`,
        sql`lower(coalesce(${units.partnerRef}, '')) like ${pattern}`,
        sql`lower(coalesce(${outlets.name}, '')) like ${pattern}`,
      ),
    )
  }
  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db
    .select({ total: count() })
    .from(units)
    .leftJoin(outlets, eq(units.outletId, outlets.id))
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, pageCount)

  if (total === 0) {
    return { units: [], total: 0, page: 1, pageSize, pageCount: 1 }
  }

  const rows = await db
    .select({
      id: units.id,
      publicId: units.publicId,
      type: units.type,
      status: units.status,
      partnerRef: units.partnerRef,
      activatedAt: units.activatedAt,
      outletName: outlets.name,
      outletAddress: outlets.formattedAddress,
      batchId: units.batchId,
      batchLabel: stockBatches.label,
    })
    .from(units)
    .leftJoin(outlets, eq(units.outletId, outlets.id))
    .leftJoin(stockBatches, eq(units.batchId, stockBatches.id))
    .where(where)
    .orderBy(desc(units.activatedAt), desc(units.createdAt))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize)

  return {
    units: rows.map((row) => ({
      ...row,
      outletName: row.outletName ?? null,
      outletAddress: row.outletAddress ?? null,
      batchId: row.batchId ?? null,
      batchLabel: row.batchLabel ?? null,
      activatedAt: stamp(row.activatedAt),
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  }
}

export async function updateUnitPartner(
  unitId: string,
  partnerRef: string | null,
) {
  const unit = await db.query.units.findFirst({
    where: eq(units.id, unitId),
  })
  if (!unit) return { ok: false as const, error: 'Kartu tidak ditemukan.' }

  const value = partnerRef?.trim() ? partnerRef.trim().slice(0, 80) : null
  await db.update(units).set({ partnerRef: value }).where(eq(units.id, unitId))
  return { ok: true as const }
}

export async function deleteUnit(unitId: string) {
  const unit = await db.query.units.findFirst({
    where: eq(units.id, unitId),
  })
  if (!unit) return { ok: false as const, error: 'Kartu tidak ditemukan.' }
  if (unit.status !== 'IN_STOCK') {
    return {
      ok: false as const,
      error:
        'Kartu yang sudah dipakai toko tidak bisa dihapus. Nonaktifkan saja.',
    }
  }

  await db.delete(units).where(eq(units.id, unitId))
  return { ok: true as const }
}

export async function getDailyClicks(days = 14, now = Date.now()) {
  const today = reportingDayKey(now)
  const firstDay = shiftReportingDay(today, -(days - 1))
  const since = reportingDayStart(firstDay)

  const empty = () =>
    Array.from({ length: days }, (_, i) => ({
      date: shiftReportingDay(firstDay, i),
      count: 0,
    }))

  const day = sqlDayBucket(clicks.at)
  const rows = await db
    .select({
      day,
      total: count(),
    })
    .from(clicks)
    .where(gte(clicks.at, since))
    .groupBy(day)
    .orderBy(day)

  const map = new Map(rows.map((r) => [r.day, Number(r.total)]))
  return empty().map((row) => ({
    ...row,
    count: map.get(row.date) ?? 0,
  }))
}

export function summarizeClickBuckets(
  buckets: Array<{ date: string; count: number }>,
) {
  const total = (rows: Array<{ count: number }>) =>
    rows.reduce((sum, row) => sum + row.count, 0)

  return {
    clicksToday: buckets.at(-1)?.count ?? 0,
    clicksLast7Days: total(buckets.slice(-8, -1)),
    clicksPrevious7Days: total(buckets.slice(-15, -8)),
    daily: buckets.slice(-14),
  }
}

export async function getUnitDetail(unitId: string) {
  const unit = await db.query.units.findFirst({
    where: eq(units.id, unitId),
    with: { outlet: true, batch: true, owner: true },
  })
  if (!unit) return null

  const today = reportingDayKey()
  const firstDay = shiftReportingDay(today, -29)
  const since = reportingDayStart(firstDay)

  const [totalRow] = await db
    .select({ total: count() })
    .from(clicks)
    .where(eq(clicks.unitId, unit.id))

  const day = sqlDayBucket(clicks.at)
  const dailyRows = await db
    .select({
      day,
      total: count(),
    })
    .from(clicks)
    .where(and(eq(clicks.unitId, unit.id), gte(clicks.at, since)))
    .groupBy(day)
    .orderBy(day)

  const map = new Map(dailyRows.map((r) => [r.day, Number(r.total)]))
  const daily = Array.from({ length: 30 }, (_, i) => {
    const date = shiftReportingDay(firstDay, i)
    return { date, count: map.get(date) ?? 0 }
  })
  const [feedback, servicePackages] = await Promise.all([
    listUnitFeedback(unit.id),
    getServicePackages(),
  ])

  return {
    id: unit.id,
    publicId: unit.publicId,
    type: unit.type,
    status: unit.status,
    serviceTier: unit.serviceTier,
    servicePackages,
    reviewMode: unit.reviewMode,
    ownerWhatsapp: unit.ownerWhatsapp,
    partnerRef: unit.partnerRef,
    holder: unit.owner
      ? {
          id: unit.owner.id,
          email: unit.owner.email,
          name: unit.owner.name,
          status: unit.owner.status,
          role: unit.owner.role,
        }
      : null,
    activatedAt: stamp(unit.activatedAt),
    nfcEncodedAt: stamp(unit.nfcEncodedAt),
    redirectUrl: `${getAppUrl()}/r/${unit.publicId}`,
    batch: unit.batch
      ? { id: unit.batch.id, label: unit.batch.label }
      : null,
    outlet: unit.outlet
      ? {
          name: unit.outlet.name,
          address: unit.outlet.formattedAddress,
          photoUrl: unit.outlet.photoUrl,
          googlePlaceId: unit.outlet.googlePlaceId,
        }
      : null,
    totalClicks: Number(totalRow?.total ?? 0),
    daily,
    feedback,
  }
}

export async function setUnitActiveState(unitId: string, active: boolean) {
  const unit = await db.query.units.findFirst({
    where: eq(units.id, unitId),
  })
  if (!unit) throw new Error('Unit tidak ditemukan')
  if (unit.status === 'IN_STOCK') {
    throw new Error('Unit belum diaktivasi')
  }
  const [updated] = await db
    .update(units)
    .set({ status: active ? 'ACTIVE' : 'INACTIVE' })
    .where(eq(units.id, unitId))
    .returning()
  return updated
}
