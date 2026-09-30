"use client"

import {
  ChevronRightIcon,
  LocateFixedIcon,
  MapPinIcon,
  SearchIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '#/components/ui/item'
import { Spinner } from '#/components/ui/spinner'
import { PlaceRatingLine } from '#/components/place-rating'
import { parseGooglePlaceId } from '#/lib/activation-places'
import { nearbyPlacesFn, searchPlacesFn } from '#/server/functions'
import type { PlaceSuggestion } from '#/server/places'

type Loc = { lat: number; lng: number }

function friendlyPlacesError() {
  return 'Tidak bisa memuat daftar toko. Coba lagi.'
}

export function PlacePicker({
  disabled,
  pin,
  publicId,
  sessionToken,
  onPick,
}: {
  disabled?: boolean
  pin?: string
  publicId: string
  sessionToken: string
  onPick: (placeId: string) => void
}) {
  const searchFn = useServerFn(searchPlacesFn)
  const nearbyFn = useServerFn(nearbyPlacesFn)
  const searchFnRef = useRef(searchFn)
  searchFnRef.current = searchFn
  const listId = useId()

  const [query, setQuery] = useState('')
  const [loc, setLoc] = useState<Loc | null>(null)
  const [places, setPlaces] = useState<PlaceSuggestion[]>([])
  const [mode, setMode] = useState<'nearby' | 'search' | 'place-id'>('nearby')
  const [geoState, setGeoState] = useState<
    'idle' | 'asking' | 'ready' | 'denied'
  >('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const locationRequestId = useRef(0)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const queryRef = useRef(query)
  queryRef.current = query

  async function loadNearby(nextLoc: Loc) {
    if (parseGooglePlaceId(queryRef.current)) return
    const id = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const res = await nearbyFn({
        data: { loc: nextLoc, publicId, pin: pin || undefined },
      })
      if (id !== requestId.current) return
      setPlaces(res.places)
      setMode('nearby')
    } catch (err) {
      if (id !== requestId.current) return
      setError(friendlyPlacesError())
    } finally {
      if (id === requestId.current) setBusy(false)
    }
  }

  function requestLocation() {
    if (parseGooglePlaceId(queryRef.current)) {
      queryRef.current = ''
      setQuery('')
    }
    const locationId = ++locationRequestId.current
    if (!navigator.geolocation) {
      setGeoState('denied')
      setError(
        'Ketik nama toko saja.',
      )
      return
    }
    setGeoState('asking')
    setError(null)
    const fallback = window.setTimeout(() => {
      if (locationRequestId.current !== locationId) return
      locationRequestId.current += 1
      setGeoState('denied')
    }, 4000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locationRequestId.current !== locationId) return
        window.clearTimeout(fallback)
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
        setLoc(next)
        setGeoState('ready')
        void loadNearby(next)
      },
      () => {
        if (locationRequestId.current !== locationId) return
        window.clearTimeout(fallback)
        setGeoState('denied')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  useEffect(() => {
    requestLocation()
  }, [])

  async function lookupPlaces(q: string) {
    const placeId = parseGooglePlaceId(q)
    const id = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const res = await searchFnRef.current({
        data: {
          query: placeId ?? q,
          publicId,
          loc: undefined,
          pin: pin || undefined,
          sessionToken,
        },
      })
      if (id !== requestId.current) return
      setPlaces(res.places)
      setMode(placeId ? 'place-id' : 'search')
    } catch {
      if (id !== requestId.current) return
      setPlaces([])
      setError(
        placeId
          ? 'Place ID itu tidak ketemu di Google Maps. Periksa ID-nya.'
          : friendlyPlacesError(),
      )
    } finally {
      if (id === requestId.current) setBusy(false)
    }
  }

  useEffect(() => {
    const q = query.trim()
    const placeId = parseGooglePlaceId(q)
    if (!placeId && q.length < 2) {
      if (loc && modeRef.current !== 'nearby') void loadNearby(loc)
      return
    }

    const timeout = window.setTimeout(() => {
      void lookupPlaces(placeId ?? q)
    }, placeId ? 0 : 350)

    return () => window.clearTimeout(timeout)
  }, [query, loc, pin, publicId, sessionToken])

  const locationLabel =
    geoState === 'asking'
      ? 'Mencari lokasi…'
      : geoState === 'ready'
        ? 'Segarkan sekitar sini'
        : 'Pakai lokasi saya'
  const showingNearby = mode === 'nearby' && geoState === 'ready'
  const resultTitle = showingNearby ? 'Toko terdekat' : 'Hasil pencarian'
  const resultDescription = showingNearby
    ? 'Dari yang paling dekat dengan kamu.'
    : 'Pilih toko yang sesuai.'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {geoState === 'ready'
          ? 'Toko di sekitar kamu ditampilkan dulu. Cari nama kalau tokonya tidak ada di daftar.'
          : geoState === 'asking'
            ? 'Mencari toko di sekitar kamu. Pencarian nama tetap bisa dipakai.'
            : geoState === 'denied'
              ? 'Lokasi tidak tersedia. Cari nama toko untuk melanjutkan.'
              : 'Cari nama toko, atau pakai lokasi untuk melihat toko di sekitar.'}
      </p>
      <InputGroup>
        <InputGroupInput
          aria-autocomplete="none"
          aria-controls={listId}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari toko"
          value={query}
        />
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      <Button
        disabled={disabled || geoState === 'asking'}
        onClick={requestLocation}
        type="button"
        variant="outline"
      >
        {geoState === 'asking' ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <LocateFixedIcon data-icon="inline-start" />
        )}
        {locationLabel}
      </Button>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {(busy || geoState === 'asking') && places.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/70 px-4 py-4 text-sm text-muted-foreground">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MapPinIcon className="size-4" />
          </span>
          <span>
            {geoState === 'asking'
              ? 'Mencari toko terdekat…'
              : 'Mencari toko yang cocok…'}
          </span>
        </div>
      ) : null}

      {places.length > 0 ? (
        <section aria-labelledby={`${listId}-label`} className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-sm font-medium" id={`${listId}-label`}>
                {resultTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {resultDescription}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
              {places.length}
            </span>
          </div>
          <ItemGroup
            aria-busy={busy}
            className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border"
            id={listId}
          >
            {places.map((place, index) => (
              <Item
                asChild
                className="w-full rounded-none border-0 border-b border-border/70 px-3.5 py-3.5 last:border-b-0 hover:bg-accent/40 sm:px-4"
                key={place.placeId}
                size="sm"
              >
                <button
                  aria-label={`Pilih ${place.name}`}
                  className="text-left"
                  disabled={disabled || busy}
                  onClick={() => onPick(place.placeId)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={
                      showingNearby && index === 0
                        ? 'flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground'
                        : 'flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground'
                    }
                  >
                    {index + 1}
                  </span>
                  <ItemContent className="min-w-0 gap-0.5">
                    <ItemTitle className="w-full min-w-0">
                      <span className="min-w-0 flex-1 truncate">{place.name}</span>
                      {showingNearby && index === 0 ? (
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                          Terdekat
                        </span>
                      ) : null}
                    </ItemTitle>
                    {place.address ? (
                      <ItemDescription>{place.address}</ItemDescription>
                    ) : (
                      <ItemDescription>Alamat belum tersedia</ItemDescription>
                    )}
                    {place.rating != null || place.userRatingCount != null ? (
                      <PlaceRatingLine
                        className="mt-1"
                        rating={place.rating}
                        showBand={false}
                        userRatingCount={place.userRatingCount}
                      />
                    ) : null}
                  </ItemContent>
                  <ItemActions className="ml-2 shrink-0">
                    <span className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover/item:bg-accent group-hover/item:text-accent-foreground">
                      <ChevronRightIcon aria-hidden="true" />
                    </span>
                  </ItemActions>
                </button>
              </Item>
            ))}
          </ItemGroup>
        </section>
      ) : null}

      {!busy &&
      places.length === 0 &&
      query.trim().length >= 2 &&
      !parseGooglePlaceId(query) ? (
        <Empty className="min-h-32 gap-3 border border-dashed border-border p-6">
          <EmptyHeader>
            <EmptyTitle>Tidak ada yang cocok</EmptyTitle>
            <EmptyDescription>
              Coba nama yang lebih lengkap.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}


    </div>
  )
}
