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
const NEARBY_RADIUS_M = 1500
const SEARCH_BIAS_RADIUS_M = 4000
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

export type LatLng = {
  lat: number
  lng: number
}

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
  }
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
  return autocompletePlacesNew(q, input.loc, input.sessionToken)
}

async function autocompletePlacesNew(
  query: string,
  loc?: LatLng | null,
  sessionToken?: string,
): Promise<PlaceSearchResult> {
  const body: Record<string, unknown> = {
    input: query,
    languageCode: 'id',
    regionCode: 'ID',
    includeQueryPredictions: false,
  }
  if (sessionToken) body.sessionToken = sessionToken
  if (loc) {
    body.locationBias = locationCircle(loc, SEARCH_BIAS_RADIUS_M)
  } else {
    body.includedRegionCodes = ['id']
  }

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

  const places = (data.suggestions ?? [])
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

  return { source: 'google', places }
}

export async function nearbyPlaces(input: {
  loc: LatLng
  includedTypes?: string[]
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

  return nearbyPlacesNew(input.loc, input.includedTypes)
}

async function nearbyPlacesNew(
  loc: LatLng,
  includedTypes?: string[],
): Promise<PlaceSearchResult> {
  const body: Record<string, unknown> = {
    languageCode: 'id',
    regionCode: 'ID',
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationRestriction: locationCircle(loc, NEARBY_RADIUS_M),
  }
  const types = includedTypes?.filter((type) => type.trim().length > 0) ?? []
  if (types.length > 0) body.includedTypes = types

  const data = await placesNew<{
    places?: Array<{
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      rating?: number
      userRatingCount?: number
      googleMapsUri?: string
      primaryType?: string
    }>
  }>('/places:searchNearby', {
    fieldMask:
      'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType',
    body,
  })

  const places = (data.places ?? [])
    .map((p) => {
      if (!p.id || !p.displayName?.text) return null
      return suggestion(p.id, p.displayName.text, p.formattedAddress ?? null, {
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        googleMapsUri: p.googleMapsUri,
        primaryType: p.primaryType,
      })
    })
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
      textSearchPlaces({
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
  const ranked = sortPlacesByClosing(places).filter((place) =>
    potentialOnly ? isPotentialProspect(place) : true,
  )
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

async function textSearchPlacesNew(
  query: string,
  loc?: LatLng | null,
  includedType?: string,
  radius?: number,
): Promise<PlaceSearchResult> {
  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: 'id',
    regionCode: 'ID',
    pageSize: 20,
  }
  if (loc) body.locationBias = locationCircle(loc, radius ?? SEARCH_BIAS_RADIUS_M)
  else body.regionCode = 'ID'
  if (includedType?.trim()) body.includedType = includedType.trim()

  const data = await placesNew<{
    places?: Array<{
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      rating?: number
      userRatingCount?: number
      googleMapsUri?: string
      primaryType?: string
    }>
  }>('/places:searchText', {
    fieldMask:
      'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType',
    body,
  })

  const places = (data.places ?? [])
    .map((p) => {
      if (!p.id || !p.displayName?.text) return null
      return suggestion(p.id, p.displayName.text, p.formattedAddress ?? null, {
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        googleMapsUri: p.googleMapsUri,
        primaryType: p.primaryType,
      })
    })
    .filter((row): row is PlaceSuggestion => row !== null)

  return { source: 'google', places }
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
