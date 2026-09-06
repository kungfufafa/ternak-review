import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { siteSettings } from '#/db/schema'

const PRIMARY = 'primary'
const CACHE_MS = 10_000

export type PublicSiteFlags = {
  homeEnabled: boolean
  affiliateEnabled: boolean
}

const DEFAULTS: PublicSiteFlags = {
  homeEnabled: true,
  affiliateEnabled: true,
}

let cache: { flags: PublicSiteFlags; at: number } | null = null

export function clearSiteFlagsCache() {
  cache = null
}

export function expireSiteFlagsCache() {
  if (cache) cache = { flags: cache.flags, at: 0 }
}

async function loadRow() {
  return (
    (await db.query.siteSettings.findFirst({
      where: eq(siteSettings.id, PRIMARY),
    })) ?? null
  )
}

function flagsFromRow(
  row: { homeEnabled: boolean; affiliateEnabled: boolean } | null,
): PublicSiteFlags {
  if (!row) return DEFAULTS
  return {
    homeEnabled: row.homeEnabled,
    affiliateEnabled: row.affiliateEnabled,
  }
}

export async function getPublicSiteFlags(): Promise<PublicSiteFlags> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.flags
  try {
    const flags = flagsFromRow(await loadRow())
    cache = { flags, at: Date.now() }
    return flags
  } catch {
    // Keep the last known flags if the table is missing or D1 blips.
    // Default ON only when we have never successfully loaded.
    return cache?.flags ?? DEFAULTS
  }
}

export async function saveSiteFlags(input: PublicSiteFlags) {
  const now = new Date()
  const flags: PublicSiteFlags = {
    homeEnabled: Boolean(input.homeEnabled),
    affiliateEnabled: Boolean(input.affiliateEnabled),
  }
  await db
    .insert(siteSettings)
    .values({
      id: PRIMARY,
      homeEnabled: flags.homeEnabled,
      affiliateEnabled: flags.affiliateEnabled,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: {
        homeEnabled: flags.homeEnabled,
        affiliateEnabled: flags.affiliateEnabled,
        updatedAt: now,
      },
    })
  cache = { flags, at: Date.now() }
  return flags
}
