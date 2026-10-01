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
    types: ['restaurant', 'bakery', 'meal_takeaway', 'bar'],
  },
  toko: {
    label: 'Toko',
    types: ['store', 'convenience_store', 'supermarket', 'clothing_store'],
  },
  salon: {
    label: 'Salon',
    types: ['hair_salon', 'beauty_salon', 'barber_shop', 'spa'],
  },
  klinik: {
    label: 'Klinik',
    types: ['dentist', 'doctor', 'pharmacy', 'veterinary_care'],
  },
  semua: {
    label: 'Semua',
    types: [] as string[],
  },
} as const

const GOOGLE_PLACE_TYPE_LABELS: Record<string, string> = {
  coffee_shop: 'Kedai kopi',
  cafe: 'Kafe',
  restaurant: 'Restoran',
  bakery: 'Toko roti',
  meal_takeaway: 'Bawa pulang',
  bar: 'Bar',
  store: 'Toko',
  convenience_store: 'Minimarket',
  supermarket: 'Supermarket',
  clothing_store: 'Toko pakaian',
  hair_salon: 'Salon rambut',
  beauty_salon: 'Salon kecantikan',
  barber_shop: 'Barbershop',
  spa: 'Spa',
  dentist: 'Dokter gigi',
  doctor: 'Dokter',
  pharmacy: 'Apotek',
  veterinary_care: 'Klinik hewan',
}

export function googlePlaceTypeLabel(primaryType: string | null | undefined) {
  if (!primaryType) return null
  return (
    GOOGLE_PLACE_TYPE_LABELS[primaryType] ??
    primaryType.replaceAll('_', ' ')
  )
}

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
  salon: ['salon', 'barbershop'],
  klinik: ['klinik', 'dokter gigi'],
}

export function cityScanKeywords(category: ProspectCategory): string[] {
  if (category === 'semua') {
    return ['kafe', 'restoran', 'toko', 'salon', 'klinik']
  }
  return [...CITY_SCAN_KEYWORDS[category]]
}

export function isPotentialProspect(input: PlaceRatingSnapshot) {
  const band = closingBand(input)
  return band === 'hot' || band === 'warm'
}

export type ProspectVerdict = 'deal' | 'save' | 'check' | 'skip'
export type ProspectConfidence = 'high' | 'mid' | 'low'

export type ProspectSignals = PlaceRatingSnapshot & {
  businessStatus?: string | null
  hasPhone?: boolean
  hasWebsite?: boolean
  hasHours?: boolean
  hasPhotos?: boolean
  serviceAreaOnly?: boolean
  branchCount?: number
  newestReviewAt?: number | null
  lowReviewShare?: number | null
}

export type ProspectFit = {
  verdict: ProspectVerdict
  confidence: ProspectConfidence
  label: string
  confidenceLabel: string
  reason: string
  evidence: string[]
}

const DAY_MS = 86_400_000
const GENERIC_NAME_TOKENS = new Set([
  'cabang',
  'outlet',
  'toko',
  'resto',
  'restoran',
  'kafe',
  'cafe',
  'kopi',
  'warung',
  'rumah',
  'makan',
  'dan',
  'the',
  'kota',
  'baru',
  'no',
  'nomor',
])

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 1 && !GENERIC_NAME_TOKENS.has(token) && !/^\d+$/.test(token),
    )
}

export function branchCounts(names: string[]) {
  const lists = names.map(nameTokens)
  const tallies = new Map<string, number>()
  for (const tokens of lists) {
    const keys = [tokens.slice(0, 1).join(' '), tokens.slice(0, 2).join(' ')].filter(
      (key) => key.length >= 4,
    )
    for (const key of new Set(keys)) {
      tallies.set(key, (tallies.get(key) ?? 0) + 1)
    }
  }
  return lists.map((tokens) => {
    const one = tokens[0] ?? ''
    const two = tokens.slice(0, 2).join(' ')
    const countTwo = two.length >= 4 ? (tallies.get(two) ?? 1) : 1
    const countOne = one.length >= 4 ? (tallies.get(one) ?? 1) : 1
    if (tokens.length >= 2 && countTwo >= 3) return countTwo
    if (tokens.length >= 2 && countOne >= 3) return countOne
    return 1
  })
}

function ageDays(timestamp: number, now = Date.now()) {
  return (now - timestamp) / DAY_MS
}

function confidenceLabel(confidence: ProspectConfidence) {
  if (confidence === 'high') return 'Keyakinan tinggi'
  if (confidence === 'mid') return 'Keyakinan sedang'
  return 'Keyakinan rendah'
}

function evidenceLines(input: ProspectSignals) {
  const lines: string[] = []
  if (input.businessStatus === 'OPERATIONAL') lines.push('Masih buka')
  else if (input.businessStatus === 'CLOSED_TEMPORARILY') lines.push('Tutup sementara')
  else if (input.businessStatus === 'CLOSED_PERMANENTLY') lines.push('Tutup permanen')
  else lines.push('Status buka tidak ada')
  if (input.serviceAreaOnly) lines.push('Tidak ada lokasi fisik')
  if (input.hasPhone === true) lines.push('Ada telepon')
  else if (input.hasPhone === false) lines.push('Tidak ada telepon')
  if (input.hasWebsite) lines.push('Ada situs')
  if (input.hasHours === true) lines.push('Jam buka terisi')
  else if (input.hasHours === false) lines.push('Jam buka kosong')
  if (input.hasPhotos === true) lines.push('Ada foto')
  else if (input.hasPhotos === false) lines.push('Tidak ada foto')
  if (input.newestReviewAt != null) {
    const days = ageDays(input.newestReviewAt)
    if (days <= 45) lines.push('Ulasan terakhir baru')
    else if (days <= 365) lines.push('Ulasan terakhir tahun ini')
    else lines.push('Ulasan terakhir sudah lama')
  }
  if ((input.branchCount ?? 1) >= 3) {
    lines.push(`Nama yang sama ${input.branchCount} kali`)
  }
  if (input.lowReviewShare != null && input.lowReviewShare >= 0.6) {
    lines.push('Ulasan yang tampil banyak yang bintang rendah')
  }
  return lines
}

function fit(
  verdict: ProspectVerdict,
  confidence: ProspectConfidence,
  label: string,
  reason: string,
  input: ProspectSignals,
): ProspectFit {
  return {
    verdict,
    confidence,
    label,
    confidenceLabel: confidenceLabel(confidence),
    reason,
    evidence: evidenceLines(input),
  }
}

export function prospectFit(input: ProspectSignals, now = Date.now()): ProspectFit {
  const reviews = input.userRatingCount
  const rating = input.rating
  const count = reviews ?? 0
  const branches = input.branchCount ?? 1
  const proof = [input.hasPhone || input.hasWebsite, input.hasHours, input.hasPhotos].filter(
    (value) => value === true,
  ).length
  const operational = input.businessStatus === 'OPERATIONAL'
  const reputation = rating != null && rating < 3.2 && count >= 8
  const complaints = input.lowReviewShare != null && input.lowReviewShare >= 0.6
  const stale =
    input.newestReviewAt != null && ageDays(input.newestReviewAt, now) > 540 && count < 50
  const fresh =
    input.newestReviewAt == null || ageDays(input.newestReviewAt, now) <= 365
  const reachable = Boolean(input.hasPhone || input.hasWebsite)

  if (
    input.businessStatus === 'CLOSED_PERMANENTLY' ||
    input.businessStatus === 'CLOSED_TEMPORARILY'
  ) {
    return fit(
      'skip',
      'high',
      'Lewati',
      'Toko ini tidak buka. Kartu tidak ada yang menerima.',
      input,
    )
  }
  if (input.serviceAreaOnly) {
    return fit(
      'skip',
      'high',
      'Lewati',
      'Tidak ada lokasi fisik. Kartu tidak bisa dipasang di meja.',
      input,
    )
  }
  if (reputation || complaints) {
    return fit(
      'skip',
      'high',
      'Lewati',
      'Rating rendah karena keluhan. Kartu tidak menyelesaikan itu.',
      input,
    )
  }
  if (count > 150) {
    return fit(
      'skip',
      'high',
      'Lewati',
      'Ulasan sudah sangat banyak. Hasil kartu tidak kelihatan.',
      input,
    )
  }
  if (branches >= 3) {
    return fit(
      'check',
      'mid',
      'Perlu dicek',
      'Nama yang sama muncul berkali-kali. Pastikan yang diajak bicara boleh memutuskan.',
      input,
    )
  }
  if (stale) {
    return fit(
      'check',
      'low',
      'Perlu dicek',
      'Ulasan terakhir sudah lama. Belum tentu tokonya masih dilayani.',
      input,
    )
  }
  if ((reviews == null && rating == null) || (count === 0 && proof < 2)) {
    return fit(
      'check',
      'low',
      'Perlu dicek',
      'Datanya tipis. Bisa listing kosong, bukan toko yang siap ditawari.',
      input,
    )
  }

  const dealShape =
    count >= 1 &&
    count <= 25 &&
    (rating == null || rating >= 3.5) &&
    fresh

  if (dealShape && operational && reachable && input.hasHours && proof >= 2) {
    return fit(
      'deal',
      'high',
      'Pasti deal',
      'Toko buka, bisa dihubungi, jam bukanya ada, dan ulasannya masih sedikit.',
      input,
    )
  }
  if (dealShape && proof >= 1) {
    return fit(
      'check',
      'low',
      'Perlu dicek',
      'Ulasan sedikit, tapi bukti tokonya belum lengkap. Jangan disebut pasti.',
      input,
    )
  }
  if (
    count >= 26 &&
    count <= 80 &&
    rating != null &&
    rating >= 3.5 &&
    fresh &&
    (operational || proof >= 2) &&
    proof >= 1
  ) {
    return fit(
      'save',
      'mid',
      'Layak disimpan',
      'Tokonya nyata dan masih ada ruang naik, tapi ulasannya sudah cukup sehingga hasil kartu tidak sekelihatan toko yang sepi.',
      input,
    )
  }
  if (count > 80) {
    return fit(
      'skip',
      'mid',
      'Lewati',
      'Ulasan sudah banyak. Kartu tidak mengubah yang kelihatan.',
      input,
    )
  }
  return fit(
    'check',
    'low',
    'Perlu dicek',
    'Bukti yang ada belum cukup untuk memutuskan.',
    input,
  )
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
