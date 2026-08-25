import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { rateLimits } from '#/db/schema'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

export async function assertRateLimit(
  bucketKey: string,
  options?: { max?: number; windowMs?: number },
) {
  const windowMs = options?.windowMs ?? WINDOW_MS
  const max = options?.max ?? MAX_ATTEMPTS
  const windowStart = new Date(
    Math.floor(Date.now() / windowMs) * windowMs,
  )

  const [row] = await db
    .insert(rateLimits)
    .values({
      bucketKey,
      windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.bucketKey, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })

  if (Number(row?.count ?? 0) > max) {
    throw new Error(
      'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
    )
  }
}
