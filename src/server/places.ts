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

  return nearbyPlacesNew(input.loc)
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
