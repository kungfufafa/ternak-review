import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { cardSettings } from '#/db/schema'
import { normalizeCardDesign, type CardDesign } from '#/lib/card-design'

const PRIMARY = 'primary'
const CACHE_MS = 10_000

let cache: { design: CardDesign; at: number } | null = null

function designFromRow(row: { design: unknown } | null): CardDesign {
  return normalizeCardDesign(row?.design)
}

export async function getCardDesign(): Promise<CardDesign> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.design
  try {
    const row = await db.query.cardSettings.findFirst({
      where: eq(cardSettings.id, PRIMARY),
    })
    const design = designFromRow(row ?? null)
    cache = { design, at: Date.now() }
    return design
  } catch {
    // Table missing or D1 blip: keep serving the last known design.
    return cache?.design ?? normalizeCardDesign(null)
  }
}

export async function saveCardDesign(design: CardDesign): Promise<CardDesign> {
  const now = new Date()
  await db
    .insert(cardSettings)
    .values({ id: PRIMARY, design, updatedAt: now })
    .onConflictDoUpdate({
      target: cardSettings.id,
      set: { design, updatedAt: now },
    })
  cache = { design, at: Date.now() }
  return design
}
