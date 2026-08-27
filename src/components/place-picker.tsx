"use client"

import { ChevronRightIcon, LocateFixedIcon, SearchIcon } from 'lucide-react'
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
import { nearbyPlacesFn, searchPlacesFn } from '#/server/functions'
import type { PlaceSuggestion } from '#/server/places'

type Loc = { lat: number; lng: number }

function friendlyPlacesError() {
  return 'Tidak bisa memuat daftar toko. Coba lagi.'
}

export function PlacePicker({
  disabled,
  publicId,
  sessionToken,
  onPick,
}: {
  disabled?: boolean
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
  const [mode, setMode] = useState<'nearby' | 'search'>('nearby')
  const [geoState, setGeoState] = useState<
    'idle' | 'asking' | 'ready' | 'denied'
  >('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  async function loadNearby(nextLoc: Loc) {
    const id = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const res = await nearbyFn({ data: { loc: nextLoc, publicId } })
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
    if (!navigator.geolocation) {
      setGeoState('denied')
      setError(
        'Ketik nama toko saja.',
      )
      return
    }
    setGeoState('asking')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
        setLoc(next)
        setGeoState('ready')
        void loadNearby(next)
      },
      () => {
        setGeoState('denied')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  useEffect(() => {
    requestLocation()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      if (loc && mode === 'search') void loadNearby(loc)
      return
    }

    const timeout = window.setTimeout(async () => {
      const id = ++requestId.current
      setBusy(true)
      setError(null)
      try {
        const res = await searchFnRef.current({
          data: {
            query: q,
            publicId,
            loc: loc ?? undefined,
            sessionToken,
          },
        })
        if (id !== requestId.current) return
        setPlaces(res.places)
        setMode('search')
      } catch (err) {
        if (id !== requestId.current) return
        setError(friendlyPlacesError())
      } finally {
        if (id === requestId.current) setBusy(false)
      }
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [query, loc, publicId, sessionToken])

  const locationLabel =
    geoState === 'asking'
      ? 'Mencari lokasi…'
      : geoState === 'ready'
        ? 'Segarkan sekitar sini'
        : 'Pakai lokasi saya'

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupInput
          aria-autocomplete="list"
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

      {places.length > 0 ? (
        <ItemGroup
          className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
          id={listId}
        >
          {places.map((place) => (
            <Item asChild key={place.placeId} size="sm">
              <button
                disabled={disabled || busy}
                onClick={() => onPick(place.placeId)}
                type="button"
              >
                <ItemContent>
                  <ItemTitle>{place.name}</ItemTitle>
                  {place.address ? (
                    <ItemDescription>{place.address}</ItemDescription>
                  ) : null}
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon />
                </ItemActions>
              </button>
            </Item>
          ))}
        </ItemGroup>
      ) : null}

      {!busy && places.length === 0 && query.trim().length >= 2 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Tidak ada yang cocok</EmptyTitle>
            <EmptyDescription>Coba nama lain.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}


    </div>
  )
}
