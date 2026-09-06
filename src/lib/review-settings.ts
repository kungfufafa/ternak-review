import { z } from 'zod'

export type ServiceTier = 'BASIC' | 'PLUS' | 'PRO'
export type ReviewMode =
  | 'GOOGLE_DIRECT'
  | 'OWNER_WHATSAPP'
  | 'ANONYMOUS_WHATSAPP'

export type ServicePackage = {
  serviceTier: ServiceTier
  name: string
  interceptMaxRating: number
}

const packageNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama paket wajib diisi.')
  .max(40, 'Nama paket maksimal 40 karakter.')
const interceptRatingSchema = z.number().int().min(1).max(5)

export const servicePackageSchema = z.discriminatedUnion('serviceTier', [
  z.object({
    serviceTier: z.literal('BASIC'),
    name: packageNameSchema,
    interceptMaxRating: z.literal(0),
  }),
  z.object({
    serviceTier: z.literal('PLUS'),
    name: packageNameSchema,
    interceptMaxRating: interceptRatingSchema,
  }),
  z.object({
    serviceTier: z.literal('PRO'),
    name: packageNameSchema,
    interceptMaxRating: interceptRatingSchema,
  }),
])

export const DEFAULT_SERVICE_PACKAGES: ServicePackage[] = [
  { serviceTier: 'BASIC', name: 'Basic', interceptMaxRating: 0 },
  { serviceTier: 'PLUS', name: 'Plus', interceptMaxRating: 3 },
  { serviceTier: 'PRO', name: 'Pro', interceptMaxRating: 3 },
]

export function modeAllowed(tier: ServiceTier, mode: ReviewMode) {
  if (mode === 'GOOGLE_DIRECT') return true
  if (mode === 'OWNER_WHATSAPP') return tier === 'PLUS' || tier === 'PRO'
  return mode === 'ANONYMOUS_WHATSAPP' && tier === 'PRO'
}

export function ratingRangeLabel(maxRating: number) {
  return maxRating === 1 ? '1' : `1–${maxRating}`
}

export function googleRangeLabel(maxRating: number) {
  if (maxRating >= 5) return null
  return maxRating === 4 ? '5' : `${maxRating + 1}–5`
}

export function interceptedPathLabel(mode: ReviewMode) {
  return mode === 'OWNER_WHATSAPP'
    ? 'membuka WhatsApp owner'
    : 'masuk ke form masukan anonim'
}

export function interceptFlowCopy(maxRating: number, intercepted: string) {
  const google = googleRangeLabel(maxRating)
  if (!google) {
    return `Rating ${ratingRangeLabel(maxRating)} ${intercepted}. Semua rating mengikuti jalur ini.`
  }
  return `Rating ${ratingRangeLabel(maxRating)} ${intercepted}. Rating ${google} langsung membuka Google Review.`
}
