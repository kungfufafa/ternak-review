export type PlaceRatingSnapshot = {
  rating: number | null
  userRatingCount: number | null
}

export type ClosingBand = 'hot' | 'warm' | 'cool' | 'unknown'

export function normalizeRating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 5) return null
  return Math.round(value * 10) / 10
}

export function normalizeReviewCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}

export function formatRating(rating: number | null) {
  if (rating == null) return 'Belum ada rating'
  return rating.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function formatReviewCount(count: number | null) {
  if (count == null) return 'jumlah ulasan tidak diketahui'
  return `${count.toLocaleString('id-ID')} ulasan`
}

export function formatPlaceRating(input: PlaceRatingSnapshot) {
  if (input.rating == null && input.userRatingCount == null) {
    return 'Rating Google belum tersedia'
  }
  if (input.rating == null) {
    return formatReviewCount(input.userRatingCount)
  }
  return `${formatRating(input.rating)} · ${formatReviewCount(input.userRatingCount ?? 0)}`
}

export function closingBand(input: PlaceRatingSnapshot): ClosingBand {
  if (input.userRatingCount == null && input.rating == null) return 'unknown'
  const count = input.userRatingCount ?? 0
  if (count <= 20) return 'hot'
  if (count <= 80) return 'warm'
  return 'cool'
}

export function closingHint(input: PlaceRatingSnapshot) {
  const band = closingBand(input)
  const count = input.userRatingCount
  const rating = input.rating
  if (band === 'unknown') {
    return 'Cek listing Google dulu sebelum closing.'
  }
  if (count === 0) {
    return 'Belum ada ulasan Google — closing paling mudah: hasil kartu langsung kelihatan.'
  }
  if (band === 'hot') {
    if (rating != null && rating < 4) {
      return 'Sedikit ulasan dan rating masih rendah — mereka butuh kartu supaya review bagus masuk lebih cepat.'
    }
    return 'Sedikit ulasan Google — mudah closing: kartu bantu volume naik kelihatan.'
  }
  if (band === 'warm') {
    return 'Ulasan sudah ada tapi masih bisa naik cepat. Jual kartu sebagai percepatan.'
  }
  if (rating != null && rating < 4.3) {
    return 'Sudah ramai tapi rating masih bisa ditarik naik. Jual kualitas, bukan volume.'
  }
  return 'Sudah ramai di Google. Closing lebih ke rutin review, bukan mulai dari nol.'
}

export const PROSPECT_CATEGORIES = {
  kopi: {
    label: 'Kopi & kafe',
    types: ['coffee_shop', 'cafe'],
  },
  makan: {
    label: 'Makanan',
    types: ['restaurant', 'bakery', 'meal_takeaway'],
  },
  toko: {
    label: 'Toko',
    types: ['store', 'convenience_store', 'supermarket', 'clothing_store'],
  },
  rawat: {
    label: 'Salon & klinik',
    types: ['hair_salon', 'beauty_salon', 'barber_shop'],
  },
  semua: {
    label: 'Semua',
    types: [] as string[],
  },
} as const

export type ProspectCategory = keyof typeof PROSPECT_CATEGORIES
export type ProspectStatus = 'NEW' | 'CONTACTED' | 'WON' | 'LOST'
export type ProspectInstallKind = 'NONE' | 'TRIAL' | 'SOLD'
export type ProspectInstallState =
  | 'none'
  | 'trial'
  | 'due'
  | 'collected'
  | 'sold'

export const DEFAULT_TRIAL_DAYS = 7

export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  NEW: 'Baru',
  CONTACTED: 'Sudah dihubungi',
  WON: 'Closing',
  LOST: 'Tidak jadi',
}

export const PROSPECT_INSTALL_LABEL: Record<ProspectInstallState, string> = {
  none: 'Belum dipasang',
  trial: 'Trial berjalan',
  due: 'Harus diambil',
  collected: 'Trial selesai',
  sold: 'Closing',
}

export function trialEndsAt(startedAt: Date | number, days = DEFAULT_TRIAL_DAYS) {
  const start = typeof startedAt === 'number' ? startedAt : startedAt.getTime()
  return new Date(start + days * 86_400_000)
}

export function prospectInstallState(
  input: {
    installKind?: string | null
    trialEndsAt?: Date | number | null
    trialCollectedAt?: Date | number | null
    unitId?: string | null
    status?: string | null
  },
  now = Date.now(),
): ProspectInstallState {
  const kind = input.installKind ?? 'NONE'
  if (kind === 'SOLD' || (input.status === 'WON' && kind !== 'TRIAL')) {
    return 'sold'
  }
  if (kind === 'TRIAL') {
    if (input.trialCollectedAt) return 'collected'
    const ends =
      input.trialEndsAt instanceof Date
        ? input.trialEndsAt.getTime()
        : input.trialEndsAt
    if (ends != null && ends <= now) return 'due'
    return 'trial'
  }
  return 'none'
}

export function trialDaysLeft(endsAt: Date | number | null, now = Date.now()) {
  if (endsAt == null) return null
  const ends = endsAt instanceof Date ? endsAt.getTime() : endsAt
  return Math.ceil((ends - now) / 86_400_000)
}

export function trialPickupLabel(endsAt: Date | number | null, now = Date.now()) {
  if (endsAt == null) return 'Jadwal ambil belum ada'
  const ends = endsAt instanceof Date ? endsAt.getTime() : endsAt
  const date = new Date(ends).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const days = Math.ceil((ends - now) / 86_400_000)
  if (days <= 0) return `Ambil hari ini · ${date}`
  if (days === 1) return `Ambil besok · ${date}`
  return `Ambil ${date} · sisa ${days} hari`
}

const CITY_SCAN_KEYWORDS: Record<Exclude<ProspectCategory, 'semua'>, string[]> = {
  kopi: ['kafe', 'warung kopi'],
  makan: ['restoran', 'rumah makan'],
  toko: ['toko', 'minimarket'],
  rawat: ['salon', 'barbershop'],
}

export function cityScanKeywords(category: ProspectCategory): string[] {
  if (category === 'semua') {
    return ['kafe', 'restoran', 'toko', 'salon']
  }
  return [...CITY_SCAN_KEYWORDS[category]]
}

export function isPotentialProspect(input: PlaceRatingSnapshot) {
  const band = closingBand(input)
  return band === 'hot' || band === 'warm'
}

export function sortPlacesByClosing<T extends PlaceRatingSnapshot>(places: T[]) {
  return [...places].sort((a, b) => {
    const aCount = a.userRatingCount ?? Number.POSITIVE_INFINITY
    const bCount = b.userRatingCount ?? Number.POSITIVE_INFINITY
    if (aCount !== bCount) return aCount - bCount
    const aRating = a.rating ?? 99
    const bRating = b.rating ?? 99
    return aRating - bRating
  })
}
