import {
  createFileRoute,
  Link,
  stripSearchParams,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  LocateFixedIcon,
  MapPinIcon,
  SearchIcon,
} from 'lucide-react'
import {
  GoogleMapsEmbed,
} from '#/components/google-maps-embed'
import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { ConfirmDelete } from '#/components/confirm-delete'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { PageHeader } from '#/components/page'
import { PlaceRatingLine } from '#/components/place-rating'
import { Alert } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Input, Select } from '#/components/ui/input'
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
import { useDebounced } from '#/hooks/use-debounced'
import {
  DEFAULT_TRIAL_DAYS,
  PROSPECT_CATEGORIES,
  PROSPECT_INSTALL_LABEL,
  PROSPECT_STATUS_LABEL,
  type ProspectCategory,
  type ProspectInstallState,
  type ProspectStatus,
} from '#/lib/place-rating'
import { formatDay } from '#/lib/utils'
import {
  collectProspectTrialFn,
  convertProspectToSoldFn,
  deleteProspectFn,
  listProspectInstallsFn,
  listProspectsFn,
  listReadyStockCardsFn,
  prospectNearbyPlacesFn,
  prospectSearchPlacesFn,
  saveProspectBatchFn,
  saveProspectFn,
  scanCityProspectsFn,
  updateProspectFn,
} from '#/server/functions'
import type { PlaceSuggestion } from '#/server/places'

const searchSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  stage: z.enum(['NEW', 'CONTACTED', 'WON', 'LOST']).optional().catch(undefined),
  install: z
    .enum(['none', 'trial', 'due', 'collected', 'sold'])
    .optional()
    .catch(undefined),
  partner: z.string().trim().min(1).optional().catch(undefined),
  sort: z.enum(['reviews', 'rating', 'recent', 'pickup']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})

function installBadgeVariant(state: ProspectInstallState) {
  if (state === 'sold') return 'success' as const
  if (state === 'due') return 'default' as const
  if (state === 'trial') return 'accent' as const
  return 'muted' as const
}

type Loc = { lat: number; lng: number }

export const Route = createFileRoute('/admin/prospects')({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, sort: 'reviews' })],
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    stage: search.stage,
    install: search.install,
    partner: search.partner,
    sort: search.sort,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const [list, readyCards, installs] = await Promise.all([
      listProspectsFn({
        data: {
          q: deps.q,
          status: deps.stage,
          install: deps.install,
          partner: deps.partner,
          sort: deps.sort ?? (deps.install === 'due' ? 'pickup' : 'reviews'),
          page: deps.page ?? 1,
          pageSize: 20,
        },
      }),
      listReadyStockCardsFn(),
      listProspectInstallsFn(),
    ])
    return { list, readyCards, installs }
  },
  component: ProspectsPage,
  head: () => ({
    meta: [{ title: 'Prospek toko — Ternak Review' }],
  }),
})

function ProspectsPage() {
  const { list, readyCards, installs } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/admin/prospects' })
  const router = useRouter()
  const nearbyFn = useServerFn(prospectNearbyPlacesFn)
  const searchFn = useServerFn(prospectSearchPlacesFn)
  const scanCityFn = useServerFn(scanCityProspectsFn)
  const saveBatchFn = useServerFn(saveProspectBatchFn)
  const saveFn = useServerFn(saveProspectFn)
  const updateFn = useServerFn(updateProspectFn)
  const deleteFn = useServerFn(deleteProspectFn)
  const collectFn = useServerFn(collectProspectTrialFn)
  const closeFn = useServerFn(convertProspectToSoldFn)
  const installByPlace = new Map(installs.map((row) => [row.googlePlaceId, row]))
  const searchFnRef = useRef(searchFn)
  searchFnRef.current = searchFn
  const listId = useId()

  const [draft, setDraft] = useState(search.q ?? '')
  const [partnerDraft, setPartnerDraft] = useState(search.partner ?? '')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('Cirebon')
  const [scanMode, setScanMode] = useState<'nearby' | 'search' | 'city'>('nearby')
  const [scannedCity, setScannedCity] = useState<{
    name: string
    address: string | null
  } | null>(null)
  const [category, setCategory] = useState<ProspectCategory>('semua')
  const [loc, setLoc] = useState<Loc | null>(null)
  const [geoState, setGeoState] = useState<'idle' | 'asking' | 'ready' | 'denied'>('idle')
  const [places, setPlaces] = useState<PlaceSuggestion[]>([])
  const [placesBusy, setPlacesBusy] = useState(false)
  const [placesError, setPlacesError] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const nextCard = readyCards[0]
  const requestId = useRef(0)
  const locationRequestId = useRef(0)
  const debouncedQ = useDebounced(draft, 300)
  const debouncedPartner = useDebounced(partnerDraft, 300)

  useEffect(() => {
    setDraft(search.q ?? '')
  }, [search.q])

  useEffect(() => {
    setPartnerDraft(search.partner ?? '')
  }, [search.partner])

  useEffect(() => {
    const next = debouncedQ.trim() || undefined
    if (next === search.q) return
    void navigate({
      replace: true,
      search: { ...search, q: next, page: undefined },
    })
  }, [debouncedQ, navigate, search])

  useEffect(() => {
    const next = debouncedPartner.trim() || undefined
    if (next === search.partner) return
    void navigate({
      replace: true,
      search: { ...search, partner: next, page: undefined },
    })
  }, [debouncedPartner, navigate, search])

  async function loadNearby(nextLoc: Loc, nextCategory = category) {
    const id = ++requestId.current
    setPlacesBusy(true)
    setPlacesError(null)
    try {
      const res = await nearbyFn({
        data: { loc: nextLoc, category: nextCategory },
      })
      if (id !== requestId.current) return
      setScanMode('nearby')
      setScannedCity(null)
      setPlaces(res.places)
    } catch {
      if (id !== requestId.current) return
      setPlacesError('Tidak bisa memuat toko terdekat. Coba lagi.')
    } finally {
      if (id === requestId.current) setPlacesBusy(false)
    }
  }

  function requestLocation() {
    const locationId = ++locationRequestId.current
    if (!navigator.geolocation) {
      setGeoState('denied')
      setPlacesError('Lokasi tidak tersedia. Cari nama toko saja.')
      return
    }
    setGeoState('asking')
    setPlacesError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locationRequestId.current !== locationId) return
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLoc(next)
        setGeoState('ready')
        void loadNearby(next)
      },
      () => {
        if (locationRequestId.current !== locationId) return
        setGeoState('denied')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      if (loc && scanMode !== 'city') void loadNearby(loc)
      return
    }
    const timeout = window.setTimeout(async () => {
      const id = ++requestId.current
      setPlacesBusy(true)
      setPlacesError(null)
      try {
        const res = await searchFnRef.current({
          data: {
            query: q,
            loc: loc ?? undefined,
            category,
          },
        })
        if (id !== requestId.current) return
        setScanMode('search')
        setScannedCity(null)
        setPlaces(res.places)
      } catch {
        if (id !== requestId.current) return
        setPlacesError('Tidak bisa mencari toko. Coba lagi.')
      } finally {
        if (id === requestId.current) setPlacesBusy(false)
      }
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [query, loc, category, scanMode])

  async function onScanCity(
    event?: React.FormEvent,
    nextCategory: ProspectCategory = category,
  ) {
    event?.preventDefault()
    const nextCity = city.trim()
    if (nextCity.length < 2) {
      setPlacesError('Isi nama kota, misalnya Cirebon.')
      return
    }
    const id = ++requestId.current
    setPlacesBusy(true)
    setPlacesError(null)
    setError(null)
    setNotice(null)
    try {
      const res = await scanCityFn({
        data: {
          city: nextCity,
          category: nextCategory,
          potentialOnly: true,
        },
      })
      if (id !== requestId.current) return
      setScanMode('city')
      setScannedCity({ name: res.city.name, address: res.city.address })
      setPlaces(res.places)
      setQuery('')
      if (res.places.length === 0) {
        setPlacesError(
          `Tidak ada toko potensial di ${res.city.name}. Coba kategori lain atau kota lain.`,
        )
      } else {
        const saved = await saveBatchFn({
          data: {
            places: res.places,
            notes: `Scan kota ${res.city.name}`,
            partnerRef: search.partner,
          },
        })
        setSavedIds((current) => {
          const next = new Set(current)
          for (const place of res.places) next.add(place.placeId)
          return next
        })
        await router.invalidate({ sync: true })
        const nextPublicId = readyCards[0]?.publicId
        setNotice(
          `${saved.created} toko potensial di ${res.city.name} siap diaktifkan${saved.existing > 0 ? ` (${saved.existing} sudah ada)` : ''}.${nextPublicId ? ` Klik Aktifkan — kartu ${nextPublicId}, trial ${DEFAULT_TRIAL_DAYS} hari lewat proses aktivasi.` : ' Produksi kartu dulu sebelum aktivasi.'}`,
        )
      }
    } catch (err) {
      if (id !== requestId.current) return
      setPlacesError(
        err instanceof Error ? err.message : 'Tidak bisa memetakan kota. Coba lagi.',
      )
    } finally {
      if (id === requestId.current) setPlacesBusy(false)
    }
  }

  async function onSave(place: PlaceSuggestion, partnerRef?: string) {
    setSavingId(place.placeId)
    setError(null)
    setNotice(null)
    try {
      const res = await saveFn({
        data: {
          placeId: place.placeId,
          partnerRef: partnerRef || search.partner,
        },
      })
      setSavedIds((current) => new Set(current).add(place.placeId))
      setNotice(
        res.created
          ? `${res.prospect.name} disimpan. Rating ${res.prospect.ratingLabel} sebelum kartu dipasang.`
          : `${res.prospect.name} sudah ada di daftar. Snapshot rating sebelumnya tetap dipakai.`,
      )
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan prospek.')
    } finally {
      setSavingId(null)
    }
  }

  async function onStatus(id: string, status: ProspectStatus) {
    setError(null)
    try {
      await updateFn({ data: { id, status } })
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status.')
    }
  }

  async function onDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError(null)
    try {
      await deleteFn({ data: { id: pendingDelete } })
      setPendingDelete(null)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus prospek.')
    } finally {
      setDeleting(false)
    }
  }

  function activateSearch(placeId: string) {
    if (!nextCard) return undefined
    return {
      id: nextCard.publicId,
      place: placeId,
      ref: search.partner,
    }
  }

  async function onCollect(prospectId: string) {
    setActingId(prospectId)
    setError(null)
    setNotice(null)
    try {
      const res = await collectFn({ data: { id: prospectId } })
      setNotice(`Kartu diambil dari ${res.name}. Masuk gudang lagi.`)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengambil kartu.')
    } finally {
      setActingId(null)
    }
  }

  async function onCloseDeal(prospectId: string) {
    setActingId(prospectId)
    setError(null)
    setNotice(null)
    try {
      const res = await closeFn({ data: { id: prospectId } })
      setNotice(`${res.name} closing. Kartu tetap terpasang.`)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal closing.')
    } finally {
      setActingId(null)
    }
  }

  const savedPlaceIds = new Set([
    ...savedIds,
    ...list.prospects.map((row) => row.googlePlaceId),
  ])

  return (
    <div className="flex w-full max-w-screen-xl flex-col gap-8">
      <PageHeader
        description={`Petakan kota, lalu aktifkan kartu seperti biasa. Aktivasi mulai trial ${DEFAULT_TRIAL_DAYS} hari — dari sini kelihatan toko mana yang sudah terpasang dan kapan harus diambil.`}
        title="Prospek toko"
      />

      {error ? <Alert variant="danger">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {list.summary.due > 0 ? (
        <Alert className="flex flex-wrap items-center justify-between gap-3" variant="danger">
          <span>{list.summary.due} toko harus diambil.</span>
          <Button
            onClick={() =>
              void navigate({
                search: { ...search, install: 'due', sort: 'pickup', page: undefined },
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Lihat yang jatuh tempo
          </Button>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Petakan kota</CardTitle>
          <CardDescription>
            Petakan kota. Toko potensial masuk daftar. Aktifkan lewat proses
            kartu yang sudah ada — itu trial {DEFAULT_TRIAL_DAYS} hari.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void onScanCity(event)}>
            <InputGroup className="flex-1">
              <InputGroupInput
                autoComplete="off"
                onChange={(event) => setCity(event.target.value)}
                placeholder="Cirebon, Bandung, Surabaya…"
                value={city}
              />
              <InputGroupAddon align="inline-start">
                <MapPinIcon />
              </InputGroupAddon>
            </InputGroup>
            <Button disabled={placesBusy || city.trim().length < 2} type="submit">
              {placesBusy && scanMode === 'city' ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Petakan kota
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PROSPECT_CATEGORIES) as ProspectCategory[]).map((key) => (
              <Button
                key={key}
                onClick={() => {
                  setCategory(key)
                  if (scanMode === 'city' && city.trim().length >= 2) {
                    void onScanCity(undefined, key)
                    return
                  }
                  if (loc && query.trim().length < 2) void loadNearby(loc, key)
                }}
                size="sm"
                type="button"
                variant={category === key ? 'default' : 'outline'}
              >
                {PROSPECT_CATEGORIES[key].label}
              </Button>
            ))}
          </div>
          {scannedCity ? (
            <GoogleMapsEmbed
              address={scannedCity.address}
              name={scannedCity.name}
              zoom={13}
            />
          ) : null}
          <details className="rounded-xl border border-border bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Cari toko spesifik atau sekitar lokasi saya
            </summary>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <InputGroup className="flex-1">
                <InputGroupInput
                  aria-controls={listId}
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nama toko spesifik…"
                  value={query}
                />
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
              </InputGroup>
              <Button
                disabled={geoState === 'asking'}
                onClick={requestLocation}
                type="button"
                variant="outline"
              >
                {geoState === 'asking' ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <LocateFixedIcon data-icon="inline-start" />
                )}
                {geoState === 'ready' ? 'Sekitar sini' : 'Lokasi saya'}
              </Button>
            </div>
          </details>
          {places.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {scanMode === 'city' && scannedCity
                ? `${places.length} toko potensial di ${scannedCity.name}. Urutan: paling sedikit ulasan dulu.`
                : `${places.length} listing Google`}
            </p>
          ) : null}
          {placesError ? <Alert variant="danger">{placesError}</Alert> : null}
          {placesBusy && places.length === 0 ? (
            <p className="text-sm text-muted-foreground">Mencari listing Google…</p>
          ) : null}
          {places.length > 0 ? (
            <ItemGroup
              className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border"
              id={listId}
            >
              {places.map((place) => {
                const saved = savedPlaceIds.has(place.placeId)
                const install = installByPlace.get(place.placeId)
                const state = install?.installState ?? 'none'
                const installed = state === 'trial' || state === 'due' || state === 'sold'
                return (
                  <Item
                    className="w-full rounded-none border-0 border-b border-border/70 px-3.5 py-3.5 last:border-b-0"
                    key={place.placeId}
                    size="sm"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <MapPinIcon className="size-4" />
                    </span>
                    <ItemContent className="min-w-0 gap-0.5">
                      <ItemTitle className="w-full min-w-0">
                        <span className="min-w-0 flex-1 truncate">{place.name}</span>
                      </ItemTitle>
                      <ItemDescription>
                        {place.address ?? 'Alamat belum tersedia'}
                      </ItemDescription>
                      <PlaceRatingLine
                        className="mt-1"
                        rating={place.rating}
                        showHint
                        userRatingCount={place.userRatingCount}
                      />
                      {installed ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={installBadgeVariant(state)}>
                            {PROSPECT_INSTALL_LABEL[state]}
                          </Badge>
                          {state !== 'sold' ? (
                            <span className="text-[11px] text-muted-foreground">
                              {install?.pickupLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </ItemContent>
                    <ItemActions className="ml-2 shrink-0">
                      <div className="flex flex-col items-end gap-2">
                        {state === 'sold' && install?.unitId ? (
                          <span className="text-[11px] text-muted-foreground">Sudah closing</span>
                        ) : state === 'trial' || state === 'due' ? (
                          <>
                            <Button
                              disabled={actingId === install?.id}
                              onClick={() => install && void onCollect(install.id)}
                              size="sm"
                              type="button"
                            >
                              {actingId === install?.id ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Ambil kartu
                            </Button>
                            <Button
                              disabled={actingId === install?.id}
                              onClick={() => install && void onCloseDeal(install.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Closing
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button asChild disabled={!nextCard} size="sm">
                              {nextCard ? (
                                <Link search={activateSearch(place.placeId)} to="/activate">
                                  Aktifkan
                                </Link>
                              ) : (
                                <span>Produksi kartu dulu</span>
                              )}
                            </Button>
                            {saved ? (
                              <span className="text-[11px] text-muted-foreground">Tersimpan</span>
                            ) : (
                              <Button
                                disabled={placesBusy || savingId === place.placeId}
                                onClick={() => void onSave(place)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                Simpan saja
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </ItemActions>
                  </Item>
                )
              })}
            </ItemGroup>
          ) : null}
          {!placesBusy && places.length === 0 && query.trim().length >= 2 ? (
            <Empty className="min-h-32 border border-dashed border-border p-6">
              <EmptyHeader>
                <EmptyTitle>Tidak ada yang cocok</EmptyTitle>
                <EmptyDescription>Coba nama lain atau kategori lain.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium tracking-tight">Daftar prospek</h2>
          <p className="text-sm text-muted-foreground">
            Setelah aktivasi, toko masuk trial. Dari sini ambil kartu atau closing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [
                undefined,
                'Semua',
                list.summary.none +
                  list.summary.trial +
                  list.summary.due +
                  list.summary.collected +
                  list.summary.sold,
              ],
              ['none', PROSPECT_INSTALL_LABEL.none, list.summary.none + list.summary.collected],
              ['trial', PROSPECT_INSTALL_LABEL.trial, list.summary.trial],
              ['due', PROSPECT_INSTALL_LABEL.due, list.summary.due],
              ['sold', PROSPECT_INSTALL_LABEL.sold, list.summary.sold],
            ] as const
          ).map(([value, label, count]) => (
            <Button
              key={label}
              onClick={() =>
                void navigate({
                  search: {
                    ...search,
                    install: value,
                    sort: value === 'due' ? 'pickup' : search.sort,
                    page: undefined,
                  },
                })
              }
              size="sm"
              type="button"
              variant={search.install === value ? 'default' : 'outline'}
            >
              {label}
              <span className="text-xs opacity-70">{count}</span>
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InputGroup>
            <InputGroupInput
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Cari nama atau alamat"
              value={draft}
            />
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
          <Select
            onChange={(event) =>
              void navigate({
                search: {
                  ...search,
                  stage: (event.target.value || undefined) as ProspectStatus | undefined,
                  page: undefined,
                },
              })
            }
            value={search.stage ?? ''}
          >
            <option value="">Semua status</option>
            {Object.entries(PROSPECT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            onChange={(event) => setPartnerDraft(event.target.value)}
            placeholder="Tag reseller"
            value={partnerDraft}
          />
          <Select
            onChange={(event) =>
              void navigate({
                search: {
                  ...search,
                  sort: (event.target.value || undefined) as
                    | 'reviews'
                    | 'rating'
                    | 'recent'
                    | 'pickup'
                    | undefined,
                  page: undefined,
                },
              })
            }
            value={search.sort ?? (search.install === 'due' ? 'pickup' : 'reviews')}
          >
            <option value="reviews">Sedikit ulasan dulu</option>
            <option value="rating">Rating rendah dulu</option>
            <option value="recent">Terbaru</option>
            <option value="pickup">Jadwal ambil dulu</option>
          </Select>
        </div>

        {list.prospects.length === 0 ? (
          <Empty className="min-h-40 border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyTitle>Belum ada prospek</EmptyTitle>
              <EmptyDescription>
                Petakan kota di atas. Toko potensial masuk daftar ini otomatis.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DataTable>
            <DataTableHead
              columns={[
                'Bisnis Google',
                'Rating sebelum kartu',
                'Kartu',
                'Reseller',
                'Disimpan',
                '',
              ]}
            />
            <tbody>
              {list.prospects.map((row) => (
                <tr key={row.id}>
                  <DataTableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.formattedAddress ?? 'Alamat belum tersedia'}
                      </span>
                      {row.googleMapsUri ? (
                        <a
                          className="text-xs text-pine underline underline-offset-4"
                          href={row.googleMapsUri}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Buka Google Review
                        </a>
                      ) : null}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <PlaceRatingLine
                      rating={row.rating}
                      showHint
                      userRatingCount={row.userRatingCount}
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-col gap-2">
                      <Badge variant={installBadgeVariant(row.installState)}>
                        {PROSPECT_INSTALL_LABEL[row.installState]}
                      </Badge>
                      {row.installState === 'trial' || row.installState === 'due' ? (
                        <span className="text-xs text-muted-foreground">
                          {row.pickupLabel}
                        </span>
                      ) : null}
                      {row.installState === 'none' || row.installState === 'collected' ? (
                        <Select
                          onChange={(event) =>
                            void onStatus(row.id, event.target.value as ProspectStatus)
                          }
                          value={row.status}
                        >
                          {Object.entries(PROSPECT_STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      ) : row.unitId ? (
                        <Link
                          className="text-xs text-pine underline underline-offset-4"
                          params={{ unitId: row.unitId }}
                          to="/dashboard/units/$unitId"
                        >
                          Lihat kartu
                        </Link>
                      ) : null}
                    </div>
                  </DataTableCell>
                  <DataTableCell muted>{row.partnerRef ?? '—'}</DataTableCell>
                  <DataTableCell muted>
                    {row.createdAt ? formatDay(row.createdAt) : '—'}
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-col items-end gap-2">
                      {row.installState === 'trial' || row.installState === 'due' ? (
                        <>
                          <Button
                            disabled={actingId === row.id}
                            onClick={() => void onCollect(row.id)}
                            size="sm"
                            type="button"
                          >
                            {actingId === row.id ? (
                              <Spinner data-icon="inline-start" />
                            ) : null}
                            Ambil kartu
                          </Button>
                          <Button
                            disabled={actingId === row.id}
                            onClick={() => void onCloseDeal(row.id)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Closing
                          </Button>
                        </>
                      ) : row.installState !== 'sold' || !row.unitId ? (
                        <Button asChild disabled={!nextCard} size="sm">
                          {nextCard ? (
                            <Link
                              search={activateSearch(row.googlePlaceId)}
                              to="/activate"
                            >
                              Aktifkan
                            </Link>
                          ) : (
                            <span>Produksi kartu dulu</span>
                          )}
                        </Button>
                      ) : null}
                      {!row.unitId ? (
                        <Button
                          onClick={() => setPendingDelete(row.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Hapus
                        </Button>
                      ) : null}
                    </div>
                  </DataTableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <ListPager
          onPage={(page) =>
            void navigate({ search: { ...search, page: page === 1 ? undefined : page } })
          }
          page={list.page}
          pageCount={list.pageCount}
          pageSize={list.pageSize}
          total={list.total}
        />
      </section>

      <ConfirmDelete
        confirmLabel="Hapus prospek"
        description="Prospek ini dihapus dari daftar. Toko yang masih trial atau closing harus diambil dulu."
        onConfirm={() => void onDelete()}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        open={Boolean(pendingDelete)}
        pending={deleting}
        title="Hapus prospek?"
      />
    </div>
  )
}
