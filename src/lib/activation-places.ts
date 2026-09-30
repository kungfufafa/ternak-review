export const ACTIVATION_SEARCH_BIAS_RADIUS_M = 4000
export const ACTIVATION_NEARBY_RADIUS_M = 1500
export const ACTIVATION_NAME_SEARCH_PAGE_SIZE = 20

/**
 * Listing yang hilang dari prediksi kalau aktivasi dilakukan di luar bias Cirebon.
 * Dipasang lewat Place ID, bukan lewat nama yang kebetulan cocok di dekat HP.
 */
export const ES_TEH_JOMBLO_KEDUNGJAYA = {
  placeId: 'ChIJh-r8egDjbi4R3XOx3BwUu8I',
  name: 'Es Teh Jomblo',
  area: 'Kedungjaya, Cirebon',
} as const

export const CIREBON_CENTER = { lat: -6.732, lng: 108.552 } as const
export const PHONE_OUTSIDE_CIREBON = { lat: -6.2088, lng: 106.8456 } as const

export type LatLng = { lat: number; lng: number }

const PLACE_ID_BODY = 'ChIJ[A-Za-z0-9_-]{16,128}'
const PLACE_ID_EXACT = new RegExp(`^(?:places/)?(${PLACE_ID_BODY})$`)
const PLACE_ID_IN_TEXT = new RegExp(PLACE_ID_BODY)

export function distanceMeters(a: LatLng, b: LatLng) {
  const earth = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function parseGooglePlaceId(raw: string): string | null {
  const text = raw.trim().replace(/^['"]|['"]$/g, '')
  if (!text) return null
  const exact = text.match(PLACE_ID_EXACT)
  if (exact?.[1]) return exact[1]
  if (
    /^https?:\/\//i.test(text) ||
    text.includes('place_id:') ||
    text.includes('query_place_id=')
  ) {
    return text.match(PLACE_ID_IN_TEXT)?.[0] ?? null
  }
  return null
}

export type AutocompletePredictionRequest = {
  locationBiasRadiusM: number | null
  includedRegionCodes: readonly ['id'] | null
}

export type ActivationLookup =
  | { kind: 'place'; placeId: string }
  | { kind: 'text'; pageSize: number; locationBiasRadiusM: null }

/**
 * Pencarian nama di aktivasi adalah Text Search, sampai 20 listing.
 * Lokasi HP tidak ikut: bias 4 km pada Autocomplete hanya mengisi 5 prediksi
 * dengan toko yang namanya mirip. Place ID tetap memasang satu listing persis.
 */
export function activationLookup(
  query: string,
  _loc?: LatLng | null,
): ActivationLookup | null {
  const placeId = parseGooglePlaceId(query)
  if (placeId) return { kind: 'place', placeId }
  const q = query.trim()
  if (q.length < 2) return null
  return {
    kind: 'text',
    pageSize: ACTIVATION_NAME_SEARCH_PAGE_SIZE,
    locationBiasRadiusM: null,
  }
}

export function isEsTehJombloKedungjaya(place: {
  placeId: string
  name: string
  address?: string | null
}) {
  const name = place.name.trim().toLowerCase()
  const address = (place.address ?? '').toLowerCase()
  return (
    place.placeId === ES_TEH_JOMBLO_KEDUNGJAYA.placeId &&
    name.includes(ES_TEH_JOMBLO_KEDUNGJAYA.name.toLowerCase()) &&
    address.includes('kedungjaya') &&
    address.includes('cirebon')
  )
}

export function nearbyActivationLookup() {
  return {
    locationRestrictionRadiusM: ACTIVATION_NEARBY_RADIUS_M,
    textQuery: null as null,
  }
}
