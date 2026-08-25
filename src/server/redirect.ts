import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { clicks, units } from '#/db/schema'
import { hashIp } from '#/lib/crypto'

export function googleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

export type RedirectResult =
  | { kind: 'activate'; publicId: string }
  | { kind: 'google'; url: string; unitId: string }
  | { kind: 'inactive'; publicId: string }
  | { kind: 'not_found' }

export async function resolveRedirect(
  publicId: string,
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

  if (unit.status === 'ACTIVE' && unit.outlet?.googlePlaceId) {
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
  await db.insert(clicks).values({
    unitId: input.unitId,
    userAgent: input.userAgent?.slice(0, 512) ?? null,
    ipHash: hashIp(input.ip),
  })
}
