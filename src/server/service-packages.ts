import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { servicePackages } from '#/db/schema'
import {
  DEFAULT_SERVICE_PACKAGES,
  servicePackageSchema,
  type ServicePackage,
  type ServiceTier,
} from '#/lib/review-settings'

export async function getServicePackages(): Promise<ServicePackage[]> {
  const rows = await db.select().from(servicePackages)
  const missing = DEFAULT_SERVICE_PACKAGES.filter(
    (defaults) => !rows.some((row) => row.serviceTier === defaults.serviceTier),
  )
  if (missing.length > 0) {
    await db
      .insert(servicePackages)
      .values(missing)
      .onConflictDoNothing({ target: servicePackages.serviceTier })
  }
  const persisted =
    missing.length > 0 ? await db.select().from(servicePackages) : rows
  return DEFAULT_SERVICE_PACKAGES.map((defaults) => ({
    ...(persisted.find((row) => row.serviceTier === defaults.serviceTier) ??
      defaults),
  }))
}

export async function getServicePackage(
  serviceTier: ServiceTier,
): Promise<ServicePackage> {
  const defaults = DEFAULT_SERVICE_PACKAGES.find(
    (item) => item.serviceTier === serviceTier,
  )
  if (!defaults) throw new Error('Paket tidak dikenal.')
  const [row] = await db
    .select()
    .from(servicePackages)
    .where(eq(servicePackages.serviceTier, serviceTier))
  return { ...(row ?? defaults) }
}

export async function updateServicePackage(
  input: ServicePackage,
): Promise<ServicePackage> {
  const settings = servicePackageSchema.parse(input)
  const [saved] = await db
    .insert(servicePackages)
    .values(settings)
    .onConflictDoUpdate({
      target: servicePackages.serviceTier,
      set: {
        name: settings.name,
        interceptMaxRating: settings.interceptMaxRating,
      },
    })
    .returning()
  if (!saved) throw new Error('Pengaturan paket gagal disimpan.')
  return saved
}
