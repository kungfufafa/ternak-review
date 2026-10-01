import {
  ACTIVATION_NAME_SEARCH_PAGE_SIZE,
  ACTIVATION_SEARCH_BIAS_RADIUS_M,
  activationLookup,
  nearbyActivationLookup,
  type AutocompletePredictionRequest,
  type LatLng,
} from '#/lib/activation-places'
import { isProduction } from '#/lib/env'
import {
  cityScanKeywords,
  isPotentialProspect,
  normalizeRating,
  normalizeReviewCount,
  sortPlacesByClosing,
  type ProspectCategory,
} from '#/lib/place-rating'
import {
  isGooglePlacesConfigured,
  resolveGoogleMapsApiKey,
} from '#/server/google'

const PLACES_NEW = 'https://places.googleapis.com/v1'
const CITY_RADIUS_M = 12_000

export type PlaceSuggestion = {
  placeId: string
  name: string
  address: string | null
  description: string
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  primaryType: string | null
  businessStatus?: string | null
  hasPhone?: boolean
  hasWebsite?: boolean
  hasHours?: boolean
  hasPhotos?: boolean
  serviceAreaOnly?: boolean
  newestReviewAt?: number | null
  lowReviewShare?: number | null
}

export type PlaceDetails = {
  placeId: string
  name: string
  formattedAddress: string | null
  photoUrl: string | null
  googleMapsUri: string | null
  rating: number | null
  userRatingCount: number | null
  primaryType: string | null
}

export type PlaceSearchResult = {
  source: 'google' | 'stub'
  places: PlaceSuggestion[]
}

export type { LatLng }

const STUB_CITY_CENTERS: Record<string, LatLng> = {
  cirebon: { lat: -6.732, lng: 108.552 },
  bandung: { lat: -6.9175, lng: 107.6191 },
  jakarta: { lat: -6.2088, lng: 106.8456 },
  surabaya: { lat: -7.2575, lng: 112.7521 },
  yogyakarta: { lat: -7.7956, lng: 110.3695 },
  semarang: { lat: -6.9667, lng: 110.4167 },
}

export { isGooglePlacesConfigured }

async function assertPlacesConfiguredForProduction() {
  if (isProduction() && !(await isGooglePlacesConfigured())) {
    throw new Error(
      'Google Places belum dikonfigurasi. Isi API key di Pengaturan → Google Maps.',
    )
  }
}

function stubRating(placeId: string) {
  let hash = 0
  for (const ch of placeId) hash = (hash + ch.charCodeAt(0)) % 97
  return {
    rating: Math.round((3.2 + (hash % 18) / 10) * 10) / 10,
    userRatingCount: 4 + ((hash * 7) % 180),
  }
}

function suggestion(
  placeId: string,
  name: string,
  address: string | null,
  extra?: {
    rating?: number | null
    userRatingCount?: number | null
    googleMapsUri?: string | null
    primaryType?: string | null
    businessStatus?: string | null
    hasPhone?: boolean
    hasWebsite?: boolean
    hasHours?: boolean
    hasPhotos?: boolean
    serviceAreaOnly?: boolean
    newestReviewAt?: number | null
    lowReviewShare?: number | null
    stubMetrics?: boolean
  },
): PlaceSuggestion {
  const trimmedName = name.trim() || 'Google Maps place'
  const trimmedAddress = address?.trim() || null
  const metrics = extra?.stubMetrics ? stubRating(placeId) : extra
  return {
    placeId,
    name: trimmedName,
    address: trimmedAddress,
    description: trimmedAddress
      ? `${trimmedName} — ${trimmedAddress}`
      : trimmedName,
    rating: normalizeRating(metrics?.rating ?? null),
    userRatingCount: normalizeReviewCount(metrics?.userRatingCount ?? null),
    googleMapsUri: extra?.googleMapsUri ?? null,
    primaryType: extra?.primaryType ?? null,
    businessStatus: extra?.businessStatus,
    hasPhone: extra?.hasPhone,
    hasWebsite: extra?.hasWebsite,
    hasHours: extra?.hasHours,
    hasPhotos: extra?.hasPhotos,
    serviceAreaOnly: extra?.serviceAreaOnly,
    newestReviewAt: extra?.newestReviewAt ?? null,
    lowReviewShare: extra?.lowReviewShare ?? null,
  }
}

const BASIC_TEXT_MASK =
  'nextPageToken,places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType'

const PROSPECT_TEXT_MASK = [
  BASIC_TEXT_MASK,
  'places.businessStatus',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.pureServiceAreaBusiness',
].join(',')

const BASIC_NEARBY_MASK =
  'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType'

const PROSPECT_NEARBY_MASK = [
  BASIC_NEARBY_MASK,
  'places.businessStatus',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.pureServiceAreaBusiness',
].join(',')

type GooglePlaceRow = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  primaryType?: string
  businessStatus?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  pureServiceAreaBusiness?: boolean
}

function suggestionFromGooglePlace(place: GooglePlaceRow) {
  if (!place.id || !place.displayName?.text) return null
  return suggestion(place.id, place.displayName.text, place.formattedAddress ?? null, {
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    googleMapsUri: place.googleMapsUri,
    primaryType: place.primaryType,
    businessStatus: place.businessStatus ?? null,
    hasPhone: Boolean(place.nationalPhoneNumber?.trim()),
    hasWebsite: Boolean(place.websiteUri?.trim()),
    hasHours: (place.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0,
    serviceAreaOnly: place.pureServiceAreaBusiness === true,
  })
}

function stubCityPlaces(city: string): PlaceSuggestion[] {
  const labels = [
    { name: `Kopi ${city}`, type: 'cafe' },
    { name: `Warung ${city}`, type: 'restaurant' },
    { name: `Resto ${city}`, type: 'restaurant' },
    { name: `Salon ${city}`, type: 'hair_salon' },
    { name: `Toko ${city}`, type: 'store' },
    { name: `Minimarket ${city}`, type: 'convenience_store' },
  ]
  return labels.map((row, index) =>
    suggestion(
      `DEV_${Buffer.from(`${city}:${row.type}:${index}`).toString('base64url').slice(0, 32)}`,
      row.name,
      `${city}, Indonesia (uji)`,
      { stubMetrics: true, primaryType: row.type },
    ),
  )
}

function stubPlaces(query: string): PlaceSearchResult {
  const q = query.trim() || 'Outlet uji'
  return {
    source: 'stub',
    places: [
      suggestion(
        `DEV_${Buffer.from(q).toString('base64url').slice(0, 24)}`,
        q,
        'Alamat uji (API key Google belum diisi)',
        { stubMetrics: true, primaryType: 'cafe' },
      ),
    ],
  }
}

type PlacesNewError = {
  error?: { code?: number; message?: string; status?: string }
}

async function placesNew<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; fieldMask: string; body?: unknown },
): Promise<T> {
  const apiKey = await resolveGoogleMapsApiKey()
  const res = await fetch(`${PLACES_NEW}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': init.fieldMask,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json()) as T & PlacesNewError
  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message ?? `Google Places ${res.status} ${res.statusText}`,
    )
  }
  return data
}

function locationCircle(loc: LatLng, radius: number) {
  return {
    circle: {
      center: { latitude: loc.lat, longitude: loc.lng },
      radius,
    },
  }
}

function suggestionFromDetails(details: PlaceDetails): PlaceSuggestion {
  return suggestion(details.placeId, details.name, details.formattedAddress, {
    rating: details.rating,
    userRatingCount: details.userRatingCount,
    googleMapsUri: details.googleMapsUri,
    primaryType: details.primaryType,
  })
}

export async function autocompletePlaces(input: {
  query: string
  loc?: LatLng | null
  sessionToken?: string
}): Promise<PlaceSearchResult> {
  await assertPlacesConfiguredForProduction()
  const q = input.query.trim()
  const configured = await isGooglePlacesConfigured()
  if (q.length < 2) return { source: configured ? 'google' : 'stub', places: [] }
  if (!configured) return stubPlaces(q)
  const requests: AutocompletePredictionRequest[] = input.loc
    ? [
        {
          locationBiasRadiusM: ACTIVATION_SEARCH_BIAS_RADIUS_M,
          includedRegionCodes: null,
        },
      ]
    : [{ locationBiasRadiusM: null, includedRegionCodes: ['id'] }]
  return autocompletePlacesNew(q, input.loc, requests, input.sessionToken)
}

export function activationNameSearchBody(query: string) {
  const lookup = activationLookup(query)
  const pageSize =
    lookup?.kind === 'text' ? lookup.pageSize : ACTIVATION_NAME_SEARCH_PAGE_SIZE
  return {
    textQuery: query.trim(),
    languageCode: 'id',
    regionCode: 'ID',
    pageSize,
  }
}

export async function searchActivationPlaces(input: {
  query: string
  loc?: LatLng | null
  sessionToken?: string
}): Promise<PlaceSearchResult> {
  await assertPlacesConfiguredForProduction()
  const q = input.query.trim()
  const lookup = activationLookup(q, input.loc)
  const configured = await isGooglePlacesConfigured()
  if (!lookup) return { source: configured ? 'google' : 'stub', places: [] }
  if (lookup.kind === 'place') {
    const details = await getPlaceDetails(lookup.placeId, input.sessionToken)
    return {
      source: configured ? 'google' : 'stub',
      places: [suggestionFromDetails(details)],
    }
  }
  if (!configured) return stubPlaces(q)
  return runTextSearch(activationNameSearchBody(q))
}

function autocompleteBody(
  query: string,
  loc: LatLng | null | undefined,
  request: AutocompletePredictionRequest,
  sessionToken?: string,
) {
  const body: Record<string, unknown> = {
    input: query,
    languageCode: 'id',
    regionCode: 'ID',
    includeQueryPredictions: false,
  }
  if (sessionToken) body.sessionToken = sessionToken
  if (request.locationBiasRadiusM != null) {
    if (!loc) throw new Error('Bias lokasi butuh koordinat HP.')
    body.locationBias = locationCircle(loc, request.locationBiasRadiusM)
  }
  if (request.includedRegionCodes) {
    body.includedRegionCodes = [...request.includedRegionCodes]
  }
  return body
}

export function activationAutocompleteBodies(
  query: string,
  loc: LatLng | null | undefined,
  requests: AutocompletePredictionRequest[],
  sessionToken?: string,
) {
  return requests.map((request) =>
    autocompleteBody(query, loc, request, sessionToken),
  )
}

async function fetchAutocompletePredictions(body: Record<string, unknown>) {
  const data = await placesNew<{
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string
        text?: { text?: string }
        structuredFormat?: {
          mainText?: { text?: string }
          secondaryText?: { text?: string }
        }
      }
    }>
  }>('/places:autocomplete', {
    fieldMask:
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    body,
  })

  return (data.suggestions ?? [])
    .map((row) => {
      const pred = row.placePrediction
      if (!pred?.placeId) return null
      const name =
        pred.structuredFormat?.mainText?.text ?? pred.text?.text ?? ''
      const address = pred.structuredFormat?.secondaryText?.text ?? null
      if (!name.trim()) return null
      return suggestion(pred.placeId, name, address)
    })
    .filter((row): row is PlaceSuggestion => row !== null)
}

function mergePredictions(groups: PlaceSuggestion[][]) {
  const seen = new Set<string>()
  const places: PlaceSuggestion[] = []
  for (const group of groups) {
    for (const place of group) {
      if (seen.has(place.placeId)) continue
      seen.add(place.placeId)
      places.push(place)
    }
  }
  return places
}

async function autocompletePlacesNew(
  query: string,
  loc: LatLng | null | undefined,
  requests: AutocompletePredictionRequest[],
  sessionToken?: string,
): Promise<PlaceSearchResult> {
  const settled = await Promise.allSettled(
    activationAutocompleteBodies(query, loc, requests, sessionToken).map(
      (body) => fetchAutocompletePredictions(body),
    ),
  )
  const groups = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
  if (groups.length === 0) {
    const rejected = settled.find((result) => result.status === 'rejected')
    throw rejected?.status === 'rejected'
      ? rejected.reason
      : new Error('Prediksi toko tidak bisa dimuat.')
  }
  return { source: 'google', places: mergePredictions(groups) }
}

export async function nearbyPlacesByTypes(
  loc: LatLng,
  types: string[],
): Promise<PlaceSearchResult> {
  const uniqueTypes = [...new Set(types.map((type) => type.trim()).filter(Boolean))]
  if (uniqueTypes.length <= 1) {
    return nearbyPlaces({
      loc,
      includedTypes: uniqueTypes.length === 1 ? uniqueTypes : undefined,
    })
  }
  const batches = await Promise.all(
    uniqueTypes.map((type) => nearbyPlaces({ loc, includedTypes: [type] })),
  )
  const seen = new Set<string>()
  const places: PlaceSuggestion[] = []
  for (const batch of batches) {
    for (const place of batch.places) {
      if (seen.has(place.placeId)) continue
      seen.add(place.placeId)
      places.push(place)
    }
  }
  return { source: batches[0]?.source ?? 'google', places }
}

export async function nearbyPlaces(input: {
  loc: LatLng
  includedTypes?: string[]
  signals?: boolean
}): Promise<PlaceSearchResult> {
  await assertPlacesConfiguredForProduction()
  if (!(await isGooglePlacesConfigured())) {
    return {
      source: 'stub',
      places: [
        suggestion(
          `DEV_${Buffer.from('nearby').toString('base64url').slice(0, 24)}`,
          'Outlet terdekat (uji)',
          'Isi API key Google di Admin → Google Maps',
          { stubMetrics: true, primaryType: 'cafe' },
        ),
      ],
    }
  }

  try {
    return await nearbyPlacesNew(input.loc, input.includedTypes, input.signals === true)
  } catch (err) {
    if (!isPlacesQuotaError(err)) throw err
    try {
      const nearby = nearbyActivationLookup()
      return await textSearchPlacesPaged({
        query: nearbyFallbackQuery(input.includedTypes),
        loc: input.loc,
        radius: nearby.locationRestrictionRadiusM,
        maxPages: 1,
      })
    } catch (fallbackErr) {
      if (isPlacesQuotaError(fallbackErr)) {
        throw new Error('Kuota pencarian Google untuk hari ini sudah habis. Coba lagi besok.')
      }
      throw fallbackErr
    }
  }
}

function isPlacesQuotaError(err: unknown) {
  const message = err instanceof Error ? err.message : ''
  return message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED')
}

function nearbyFallbackQuery(types?: string[]) {
  const labels: Record<string, string> = {
    coffee_shop: 'kafe',
    cafe: 'kafe',
    restaurant: 'restoran',
    bakery: 'toko roti',
    meal_takeaway: 'makanan',
    bar: 'bar',
    store: 'toko',
    convenience_store: 'minimarket',
    supermarket: 'supermarket',
    clothing_store: 'toko pakaian',
    hair_salon: 'salon',
    beauty_salon: 'salon',
    barber_shop: 'barbershop',
    spa: 'spa',
    dentist: 'dokter gigi',
    doctor: 'klinik',
    pharmacy: 'apotek',
    veterinary_care: 'klinik hewan',
  }
  const words = [
    ...new Set((types ?? []).map((type) => labels[type] ?? type.replaceAll('_', ' '))),
  ]
  return words.length > 0 ? words.join(' ') : 'kafe restoran toko'
}

export function nearbySearchBody(loc: LatLng, includedTypes?: string[]) {
  const nearby = nearbyActivationLookup()
  const body: Record<string, unknown> = {
    languageCode: 'id',
    regionCode: 'ID',
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationRestriction: locationCircle(loc, nearby.locationRestrictionRadiusM),
  }
  const types = includedTypes?.filter((type) => type.trim().length > 0) ?? []
  if (types.length > 0) body.includedTypes = types
  return body
}

async function nearbyPlacesNew(
  loc: LatLng,
  includedTypes?: string[],
  signals = false,
): Promise<PlaceSearchResult> {
  const body = nearbySearchBody(loc, includedTypes)

  const data = await placesNew<{ places?: GooglePlaceRow[] }>('/places:searchNearby', {
    fieldMask: signals ? PROSPECT_NEARBY_MASK : BASIC_NEARBY_MASK,
    body,
  })

  const places = (data.places ?? [])
    .map((place) => suggestionFromGooglePlace(place))
    .filter((row): row is PlaceSuggestion => row !== null)

  return { source: 'google', places }
}

export type CityScanResult = {
  source: 'google' | 'stub'
  city: {
    name: string
    address: string | null
    loc: LatLng | null
  }
  places: PlaceSuggestion[]
  potentialCount: number
}

function stubCityCenter(city: string): CityScanResult['city'] {
  const key = city.trim().toLowerCase()
  return {
    name: city.trim(),
    address: `${city.trim()}, Indonesia`,
    loc: STUB_CITY_CENTERS[key] ?? { lat: -6.2, lng: 106.816 },
  }
}

export async function scanCityPlaces(input: {
  city: string
  category?: ProspectCategory
  potentialOnly?: boolean
}): Promise<CityScanResult> {
  await assertPlacesConfiguredForProduction()
  const city = input.city.trim().replace(/\s+/g, ' ')
  if (city.length < 2) {
    throw new Error('Isi nama kota, misalnya Cirebon.')
  }
  const category = input.category ?? 'semua'
  const configured = await isGooglePlacesConfigured()
  if (!configured) {
    const places = sortPlacesByClosing(stubCityPlaces(city)).filter((place) =>
      input.potentialOnly ? isPotentialProspect(place) : true,
    )
    return {
      source: 'stub',
      city: stubCityCenter(city),
      places,
      potentialCount: places.filter(isPotentialProspect).length,
    }
  }
  return scanCityPlacesNew(city, category, input.potentialOnly === true)
}

async function resolveCityCenter(city: string): Promise<CityScanResult['city']> {
  const data = await placesNew<{
    places?: Array<{
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
    }>
  }>('/places:searchText', {
    fieldMask: 'places.displayName,places.formattedAddress,places.location',
    body: {
      textQuery: `${city}, Indonesia`,
      languageCode: 'id',
      regionCode: 'ID',
      pageSize: 3,
    },
  })
  const hit = (data.places ?? []).find(
    (place) =>
      typeof place.location?.latitude === 'number' &&
      typeof place.location?.longitude === 'number',
  )
  if (!hit?.location) return stubCityCenter(city)
  return {
    name: hit.displayName?.text?.trim() || city,
    address: hit.formattedAddress ?? `${city}, Indonesia`,
    loc: {
      lat: hit.location.latitude as number,
      lng: hit.location.longitude as number,
    },
  }
}

async function scanCityPlacesNew(
  city: string,
  category: ProspectCategory,
  potentialOnly: boolean,
): Promise<CityScanResult> {
  const cityCenter = await resolveCityCenter(city)
  const keywords = cityScanKeywords(category)
  const batches = await Promise.all(
    keywords.map((keyword) =>
      textSearchPlacesPaged({
        query: `${keyword} di ${city}`,
        loc: cityCenter.loc,
        radius: CITY_RADIUS_M,
      }),
    ),
  )
  const seen = new Set<string>()
  const places: PlaceSuggestion[] = []
  for (const batch of batches) {
    for (const place of batch.places) {
      if (seen.has(place.placeId)) continue
      seen.add(place.placeId)
      places.push(place)
    }
  }
  const ranked = potentialOnly
    ? sortPlacesByClosing(places).filter(isPotentialProspect)
    : places
  return {
    source: 'google',
    city: cityCenter,
    places: ranked,
    potentialCount: ranked.filter(isPotentialProspect).length,
  }
}

export async function textSearchPlaces(input: {
  query: string
  loc?: LatLng | null
  includedType?: string
  radius?: number
}): Promise<PlaceSearchResult> {
  await assertPlacesConfiguredForProduction()
  const q = input.query.trim()
  const configured = await isGooglePlacesConfigured()
  if (q.length < 2) return { source: configured ? 'google' : 'stub', places: [] }
  if (!configured) return stubPlaces(q)
  return textSearchPlacesNew(q, input.loc, input.includedType, input.radius)
}

async function runTextSearch(body: Record<string, unknown>): Promise<PlaceSearchResult> {
  const page = await runTextSearchPage(body, false)
  return { source: 'google', places: page.places }
}

async function runTextSearchPage(body: Record<string, unknown>, signals: boolean) {
  const data = await placesNew<{
    nextPageToken?: string
    places?: GooglePlaceRow[]
  }>('/places:searchText', {
    fieldMask: signals ? PROSPECT_TEXT_MASK : BASIC_TEXT_MASK,
    body,
  })

  const places = (data.places ?? [])
    .map((place) => suggestionFromGooglePlace(place))
    .filter((row): row is PlaceSuggestion => row !== null)

  return { places, nextPageToken: data.nextPageToken }
}

function textSearchBody(
  query: string,
  loc?: LatLng | null,
  includedType?: string,
  radius?: number,
) {
  const body: Record<string, unknown> = loc
    ? {
        textQuery: query,
        languageCode: 'id',
        regionCode: 'ID',
        pageSize: ACTIVATION_NAME_SEARCH_PAGE_SIZE,
        locationBias: locationCircle(loc, radius ?? ACTIVATION_SEARCH_BIAS_RADIUS_M),
      }
    : { ...activationNameSearchBody(query) }
  if (includedType?.trim()) body.includedType = includedType.trim()
  return body
}

/** Google Text Search mengembalikan 20 sekali jalan, paling banyak 3 halaman. */
export async function textSearchPlacesPaged(input: {
  query: string
  loc?: LatLng | null
  includedType?: string
  radius?: number
  maxPages?: number
}): Promise<PlaceSearchResult> {
  await assertPlacesConfiguredForProduction()
  const q = input.query.trim()
  const configured = await isGooglePlacesConfigured()
  if (q.length < 2) return { source: configured ? 'google' : 'stub', places: [] }
  if (!configured) return stubPlaces(q)

  const body = textSearchBody(q, input.loc, input.includedType, input.radius)
  const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 3)
  const seen = new Set<string>()
  const places: PlaceSuggestion[] = []
  let pageToken: string | undefined

  for (let page = 0; page < maxPages; page++) {
    try {
      const result = await runTextSearchPage(
        pageToken ? { ...body, pageToken } : body,
        true,
      )
      for (const place of result.places) {
        if (seen.has(place.placeId)) continue
        seen.add(place.placeId)
        places.push(place)
      }
      if (!result.nextPageToken) break
      pageToken = result.nextPageToken
    } catch (err) {
      if (page === 0) throw err
      break
    }
  }

  return { source: 'google', places }
}

async function textSearchPlacesNew(
  query: string,
  loc?: LatLng | null,
  includedType?: string,
  radius?: number,
): Promise<PlaceSearchResult> {
  const body = textSearchBody(query, loc, includedType, radius)
  return runTextSearch(body)
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> {
  const id = placeId.trim()
  if (!id) throw new Error('Place ID kosong')

  await assertPlacesConfiguredForProduction()
  if (isProduction() && id.startsWith('DEV_')) {
    throw new Error('Place ID development tidak boleh dipakai di production.')
  }

  const configured = await isGooglePlacesConfigured()
  if (!configured || id.startsWith('DEV_')) {
    const name = id.startsWith('DEV_')
      ? Buffer.from(id.slice(4), 'base64url').toString('utf8') || 'Outlet Uji'
      : 'Outlet Uji'
    const metrics = stubRating(id)
    return {
      placeId: id,
      name,
      formattedAddress: configured
        ? null
        : 'Alamat uji (tanpa Google API key)',
      photoUrl: null,
      googleMapsUri: id.startsWith('DEV_')
        ? null
        : `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}`,
      rating: metrics.rating,
      userRatingCount: metrics.userRatingCount,
      primaryType: 'cafe',
    }
  }

  return getPlaceDetailsNew(id, sessionToken)
}

async function getPlaceDetailsNew(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> {
  const path = `/places/${encodeURIComponent(placeId)}`
  const url = sessionToken
    ? `${path}?sessionToken=${encodeURIComponent(sessionToken)}`
    : path

  const data = await placesNew<{
    id?: string
    displayName?: { text?: string }
    formattedAddress?: string
    googleMapsUri?: string
    rating?: number
    userRatingCount?: number
    primaryType?: string
  }>(url, {
    method: 'GET',
    fieldMask:
      'id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,primaryType',
  })

  const resolvedId = data.id ?? placeId
  const name = data.displayName?.text?.trim()
  if (!name) throw new Error('Google Maps tidak mengembalikan nama tempat')

  return {
    placeId: resolvedId,
    name,
    formattedAddress: data.formattedAddress ?? null,
    photoUrl: null,
    googleMapsUri:
      data.googleMapsUri ??
      `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(resolvedId)}`,
    rating: normalizeRating(data.rating ?? null),
    userRatingCount: normalizeReviewCount(data.userRatingCount ?? null),
    primaryType: data.primaryType ?? null,
  }
}
