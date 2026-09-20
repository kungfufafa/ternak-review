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

export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  NEW: 'Baru',
  CONTACTED: 'Sudah dihubungi',
  WON: 'Closing',
  LOST: 'Tidak jadi',
}
