import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { clicks, units } from '#/db/schema'
import { hashIp, hashToken } from '#/lib/crypto'
import { modeAllowed } from '#/lib/review-settings'
import { googleReviewUrl } from './review'
const CLICK_DEDUPE_MS = 5 * 60 * 1000
const MAX_RECENT_CLICK_IDS = 10_000
const recentClickIds = new Map<string, number>()

function rememberClick(id: string, now: number) {
  const existing = recentClickIds.get(id)
  if (existing && existing > now) return false

  if (recentClickIds.size >= MAX_RECENT_CLICK_IDS) {
    for (const [key, expiresAt] of recentClickIds) {
      if (expiresAt <= now || recentClickIds.size >= MAX_RECENT_CLICK_IDS) {
        recentClickIds.delete(key)
      }
      if (recentClickIds.size < MAX_RECENT_CLICK_IDS) break
    }
  }
  recentClickIds.set(id, now + CLICK_DEDUPE_MS)
  return true
}

export type RedirectResult =
  | { kind: 'activate'; publicId: string }
  | { kind: 'manage'; publicId: string; unitId: string }
  | { kind: 'google'; url: string; unitId: string }
  | { kind: 'feedback'; publicId: string; unitId: string }
  | { kind: 'inactive'; publicId: string }
  | { kind: 'not_found' }

export async function resolveRedirect(
  publicId: string,
  sessionOwnerId?: string | null,
): Promise<RedirectResult> {
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, publicId.toUpperCase()),
    with: { outlet: true },
  })

  if (!unit) return { kind: 'not_found' }

  if (unit.status === 'IN_STOCK') {
    return { kind: 'activate', publicId: unit.publicId }
  }

  if (unit.status === 'INACTIVE') {
    return { kind: 'inactive', publicId: unit.publicId }
  }

  if (
    unit.status === 'ACTIVE' &&
    sessionOwnerId &&
    unit.ownerId === sessionOwnerId
  ) {
    return { kind: 'manage', publicId: unit.publicId, unitId: unit.id }
  }

  if (unit.status === 'ACTIVE' && unit.outlet?.googlePlaceId) {
    if (
      unit.serviceTier !== 'BASIC' &&
      unit.reviewMode !== 'GOOGLE_DIRECT' &&
      modeAllowed(unit.serviceTier, unit.reviewMode)
    ) {
      return {
        kind: 'feedback',
        publicId: unit.publicId,
        unitId: unit.id,
      }
    }
    return {
      kind: 'google',
      url: googleReviewUrl(unit.outlet.googlePlaceId),
      unitId: unit.id,
    }
  }

  return { kind: 'not_found' }
}

export async function logClick(input: {
  unitId: string
  userAgent?: string | null
  ip?: string | null
}) {
  const userAgent = input.userAgent?.slice(0, 512) ?? null
  const ipHash = hashIp(input.ip)
  const clientHash =
    ipHash ?? hashToken(`anonymous:${userAgent ?? 'unknown-agent'}`)
  const now = Date.now()
  const bucket = Math.floor(now / CLICK_DEDUPE_MS)
  const id = hashToken(`click:${input.unitId}:${clientHash}:${bucket}`)

  if (!rememberClick(id, now)) return

  try {
    await db
      .insert(clicks)
      .values({ id, unitId: input.unitId, userAgent, ipHash })
      .onConflictDoNothing({ target: clicks.id })
  } catch (error) {
    recentClickIds.delete(id)
    throw error
  }
}
