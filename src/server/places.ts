import { getGoogleMapsApiKey } from '#/lib/env'

const PLACES_NEW = 'https://places.googleapis.com/v1'
const NEARBY_RADIUS_M = 1500
const SEARCH_BIAS_RADIUS_M = 4000

export type PlaceSuggestion = {
  placeId: string
  name: string
  address: string | null
  description: string
}

export type PlaceDetails = {
  placeId: string
  name: string
  formattedAddress: string | null
  photoUrl: string | null
  googleMapsUri: string | null
}

export type PlaceSearchResult = {
  source: 'google' | 'stub'
  places: PlaceSuggestion[]
}

export type LatLng = {
  lat: number
  lng: number
}

export function isGooglePlacesConfigured() {
  return getGoogleMapsApiKey().length > 0
}

function suggestion(
  placeId: string,
  name: string,
  address: string | null,
): PlaceSuggestion {
  const trimmedName = name.trim() || 'Google Maps place'
  const trimmedAddress = address?.trim() || null
  return {
    placeId,
    name: trimmedName,
    address: trimmedAddress,
    description: trimmedAddress
      ? `${trimmedName} — ${trimmedAddress}`
      : trimmedName,
  }
}

function stubPlaces(query: string): PlaceSearchResult {
  const q = query.trim() || 'Outlet uji'
  return {
    source: 'stub',
    places: [
      suggestion(
        `DEV_${Buffer.from(q).toString('base64url').slice(0, 24)}`,
        q,
        'Alamat uji (GOOGLE_MAPS_API_KEY belum diisi)',
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
  const apiKey = getGoogleMapsApiKey()
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
  const q = input.query.trim()
  if (q.length < 2) return { source: isGooglePlacesConfigured() ? 'google' : 'stub', places: [] }
  if (!isGooglePlacesConfigured()) return stubPlaces(q)

  try {
    return await autocompletePlacesNew(q, input.loc, input.sessionToken)
  } catch (err) {
    console.warn('[places] autocomplete (New) failed, trying legacy', err)
    return autocompletePlacesLegacy(q, input.loc)
  }
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

async function autocompletePlacesLegacy(
  query: string,
  loc?: LatLng | null,
): Promise<PlaceSearchResult> {
  const url = new URL(
    'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  )
  url.searchParams.set('input', query)
  url.searchParams.set('key', getGoogleMapsApiKey())
  url.searchParams.set('types', 'establishment')
  url.searchParams.set('language', 'id')
  url.searchParams.set('components', 'country:id')
  if (loc) {
    url.searchParams.set('location', `${loc.lat},${loc.lng}`)
    url.searchParams.set('radius', String(SEARCH_BIAS_RADIUS_M))
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error('Gagal memanggil Google Places Autocomplete')
  const data = (await res.json()) as {
    status: string
    predictions?: Array<{
      place_id: string
      description: string
      structured_formatting?: {
        main_text?: string
        secondary_text?: string
      }
    }>
    error_message?: string
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message ?? `Places status: ${data.status}`)
  }

  const places = (data.predictions ?? []).map((p) =>
    suggestion(
      p.place_id,
      p.structured_formatting?.main_text ?? p.description,
      p.structured_formatting?.secondary_text ?? null,
    ),
  )
  return { source: 'google', places }
}

export async function nearbyPlaces(input: {
  loc: LatLng
}): Promise<PlaceSearchResult> {
  if (!isGooglePlacesConfigured()) {
    return {
      source: 'stub',
      places: [
        suggestion(
          `DEV_${Buffer.from('nearby').toString('base64url').slice(0, 24)}`,
          'Outlet terdekat (uji)',
          'Nyalakan GOOGLE_MAPS_API_KEY untuk daftar Google Maps asli',
        ),
      ],
    }
  }

  try {
    return await nearbyPlacesNew(input.loc)
  } catch (err) {
    console.warn('[places] nearby (New) failed, trying legacy', err)
    return nearbyPlacesLegacy(input.loc)
  }
}

async function nearbyPlacesNew(loc: LatLng): Promise<PlaceSearchResult> {
  const data = await placesNew<{
    places?: Array<{
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
    }>
  }>('/places:searchNearby', {
    fieldMask: 'places.id,places.displayName,places.formattedAddress',
    body: {
      languageCode: 'id',
      regionCode: 'ID',
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: locationCircle(loc, NEARBY_RADIUS_M),
    },
  })

  const places = (data.places ?? [])
    .map((p) => {
      if (!p.id || !p.displayName?.text) return null
      return suggestion(p.id, p.displayName.text, p.formattedAddress ?? null)
    })
    .filter((row): row is PlaceSuggestion => row !== null)

  return { source: 'google', places }
}

async function nearbyPlacesLegacy(loc: LatLng): Promise<PlaceSearchResult> {
  const url = new URL(
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
  )
  url.searchParams.set('location', `${loc.lat},${loc.lng}`)
  url.searchParams.set('radius', String(NEARBY_RADIUS_M))
  url.searchParams.set('type', 'establishment')
  url.searchParams.set('language', 'id')
  url.searchParams.set('key', getGoogleMapsApiKey())

  const res = await fetch(url)
  if (!res.ok) throw new Error('Gagal memanggil Google Places Nearby')
  const data = (await res.json()) as {
    status: string
    results?: Array<{
      place_id: string
      name: string
      vicinity?: string
      formatted_address?: string
    }>
    error_message?: string
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message ?? `Places Nearby: ${data.status}`)
  }

  const places = (data.results ?? []).map((p) =>
    suggestion(
      p.place_id,
      p.name,
      p.vicinity ?? p.formatted_address ?? null,
    ),
  )
  return { source: 'google', places }
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> {
  const id = placeId.trim()
  if (!id) throw new Error('Place ID kosong')

  if (!isGooglePlacesConfigured() || id.startsWith('DEV_')) {
    const name = id.startsWith('DEV_')
      ? Buffer.from(id.slice(4), 'base64url').toString('utf8') || 'Outlet Uji'
      : 'Outlet Uji'
    return {
      placeId: id,
      name,
      formattedAddress: isGooglePlacesConfigured()
        ? null
        : 'Alamat uji (tanpa Google API key)',
      photoUrl: null,
      googleMapsUri: id.startsWith('DEV_')
        ? null
        : `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}`,
    }
  }

  try {
    return await getPlaceDetailsNew(id, sessionToken)
  } catch (err) {
    console.warn('[places] details (New) failed, trying legacy', err)
    return getPlaceDetailsLegacy(id)
  }
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
  }>(url, {
    method: 'GET',
    fieldMask: 'id,displayName,formattedAddress,googleMapsUri',
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
  }
}

async function getPlaceDetailsLegacy(placeId: string): Promise<PlaceDetails> {
  const apiKey = getGoogleMapsApiKey()
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'place_id,name,formatted_address,url,photos')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('language', 'id')

  const res = await fetch(url)
  if (!res.ok) throw new Error('Gagal memanggil Google Place Details')
  const data = (await res.json()) as {
    status: string
    result?: {
      place_id: string
      name: string
      formatted_address?: string
      url?: string
      photos?: Array<{ photo_reference: string }>
    }
    error_message?: string
  }
  if (data.status !== 'OK' || !data.result?.name) {
    throw new Error(data.error_message ?? `Place Details: ${data.status}`)
  }

  let photoUrl: string | null = null
  const ref = data.result.photos?.[0]?.photo_reference
  if (ref) {
    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`
  }

  return {
    placeId: data.result.place_id,
    name: data.result.name,
    formattedAddress: data.result.formatted_address ?? null,
    photoUrl,
    googleMapsUri:
      data.result.url ??
      `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(data.result.place_id)}`,
  }
}
