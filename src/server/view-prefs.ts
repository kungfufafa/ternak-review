import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { ownerViewPrefs } from '#/db/schema'
import {
  normalizeViewPrefs,
  parseStoredViewPrefs,
  type ViewKey,
  type ViewPrefs,
} from '#/lib/view-prefs'

async function loadRow(ownerId: string, view: ViewKey) {
  return (
    (await db.query.ownerViewPrefs.findFirst({
      where: and(
        eq(ownerViewPrefs.ownerId, ownerId),
        eq(ownerViewPrefs.view, view),
      ),
    })) ?? null
  )
}

export async function getViewPrefs(
  ownerId: string,
  view: ViewKey,
): Promise<Required<ViewPrefs>> {
  const row = await loadRow(ownerId, view)
  return parseStoredViewPrefs(view, row?.prefs ?? null)
}

export async function saveViewPrefs(
  ownerId: string,
  view: ViewKey,
  prefs: ViewPrefs,
): Promise<Required<ViewPrefs>> {
  const normalized = normalizeViewPrefs(view, prefs)
  const stored = JSON.stringify(normalized)
  const now = new Date()
  await db
    .insert(ownerViewPrefs)
    .values({ ownerId, view, prefs: stored, updatedAt: now })
    .onConflictDoUpdate({
      target: [ownerViewPrefs.ownerId, ownerViewPrefs.view],
      set: { prefs: stored, updatedAt: now },
    })
  return normalized
}
