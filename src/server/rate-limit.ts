import { lt, sql } from 'drizzle-orm'
import { db } from '#/db'
import { rateLimits } from '#/db/schema'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000
let lastCleanupAt = 0

async function cleanupExpiredWindows(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now - RETENTION_MS)))
}

export async function assertRateLimit(
  bucketKey: string,
  options?: { max?: number; windowMs?: number },
) {
  if (bucketKey.length > 160) throw new Error('Rate-limit key terlalu panjang')
  const windowMs = options?.windowMs ?? WINDOW_MS
  const max = options?.max ?? MAX_ATTEMPTS
  const now = Date.now()
  const windowStart = new Date(
    Math.floor(now / windowMs) * windowMs,
  )

  await cleanupExpiredWindows(now)

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
