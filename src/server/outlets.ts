import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { outlets } from '#/db/schema'
import type { PlaceDetails } from '#/server/places'

export async function upsertOutletFromPlace(details: PlaceDetails) {
  const now = new Date()
  const existing = await db.query.outlets.findFirst({
    where: eq(outlets.googlePlaceId, details.placeId),
  })
  const keepBaseline = Boolean(existing?.baselineCapturedAt)
  const nextBaseline =
    details.rating != null || details.userRatingCount != null ? now : null

  const [outlet] = await db
    .insert(outlets)
    .values({
      googlePlaceId: details.placeId,
      name: details.name,
      formattedAddress: details.formattedAddress,
      photoUrl: details.photoUrl,
      baselineRating: details.rating,
      baselineUserRatingCount: details.userRatingCount,
      baselineCapturedAt: nextBaseline,
    })
    .onConflictDoUpdate({
      target: outlets.googlePlaceId,
      set: {
        name: details.name,
        formattedAddress: details.formattedAddress,
        photoUrl: details.photoUrl,
        updatedAt: now,
        baselineRating: keepBaseline ? existing?.baselineRating : details.rating,
        baselineUserRatingCount: keepBaseline
          ? existing?.baselineUserRatingCount
          : details.userRatingCount,
        baselineCapturedAt: keepBaseline
          ? existing?.baselineCapturedAt
          : nextBaseline,
      },
    })
    .returning({ id: outlets.id })
  if (!outlet) throw new Error('Gagal menyimpan outlet')
  return outlet.id
}
