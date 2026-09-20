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
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Field, FieldLabel } from '#/components/ui/field'
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
  PROSPECT_CATEGORIES,
  PROSPECT_STATUS_LABEL,
  isPotentialProspect,
  type ProspectCategory,
  type ProspectStatus,
} from '#/lib/place-rating'
import { formatDay } from '#/lib/utils'
import {
  attachProspectToCardFn,
  deleteProspectFn,
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
  partner: z.string().trim().min(1).optional().catch(undefined),
  sort: z.enum(['reviews', 'rating', 'recent']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})

type Loc = { lat: number; lng: number }

export const Route = createFileRoute('/admin/prospects')({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, sort: 'reviews' })],
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    stage: search.stage,
    partner: search.partner,
    sort: search.sort,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const [list, readyCards] = await Promise.all([
      listProspectsFn({
        data: {
          q: deps.q,
          status: deps.stage,
          partner: deps.partner,
          sort: deps.sort ?? 'reviews',
          page: deps.page ?? 1,
          pageSize: 20,
        },
      }),
      listReadyStockCardsFn(),
    ])
    return { list, readyCards }
  },
  component: ProspectsPage,
  head: () => ({
    meta: [{ title: 'Prospek toko — Ternak Review' }],
  }),
})

function ProspectsPage() {
  const { list, readyCards } = Route.useLoaderData()
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
  const attachFn = useServerFn(attachProspectToCardFn)
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
  const [attachFor, setAttachFor] = useState<string | null>(null)
  const [publicId, setPublicId] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [savingBatch, setSavingBatch] = useState(false)
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
    requestLocation()
  }, [])

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
        setNotice(
          `${res.places.length} toko potensial di ${res.city.name} siap dipasangi kartu. Rating dan jumlah ulasan di bawah adalah kondisi sebelum kartu diisi.`,
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

  async function onSavePotential() {
    const targets = places.filter(
      (place) =>
        isPotentialProspect(place) && !savedPlaceIds.has(place.placeId),
    )
    if (targets.length === 0) {
      setError('Semua toko potensial di hasil ini sudah tersimpan.')
      return
    }
    setSavingBatch(true)
    setError(null)
    setNotice(null)
    try {
      const res = await saveBatchFn({
        data: {
          places: targets,
          notes: scannedCity
            ? `Scan kota ${scannedCity.name}`
            : city.trim()
              ? `Scan kota ${city.trim()}`
              : undefined,
          partnerRef: search.partner,
        },
      })
      setSavedIds((current) => {
        const next = new Set(current)
        for (const place of targets) next.add(place.placeId)
        return next
      })
      setNotice(
        `${res.created} toko potensial disimpan${res.existing > 0 ? `, ${res.existing} sudah ada` : ''}. Siap dipasangi kartu.`,
      )
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menyimpan toko potensial.',
      )
    } finally {
      setSavingBatch(false)
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

  async function onAttach() {
    if (!attachFor || !publicId.trim()) return
    setAttaching(true)
    setError(null)
    setNotice(null)
    try {
      const res = await attachFn({
        data: { prospectId: attachFor, publicId: publicId.trim() },
      })
      setAttachFor(null)
      setPublicId('')
      setNotice(`Kartu ${res.publicId} terpasang ke ${res.outlet.name}.`)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memasang kartu.')
    } finally {
      setAttaching(false)
    }
  }

  const savedPlaceIds = new Set([
    ...savedIds,
    ...list.prospects.map((row) => row.googlePlaceId),
  ])

  return (
    <div className="flex w-full max-w-screen-xl flex-col gap-8">
      <PageHeader
        description="Petakan satu kota, misalnya Cirebon, lalu simpan toko potensial yang rating dan jumlah ulasannya masih rendah — sebelum kartu review dipasang."
        title="Prospek toko"
      />

      {error ? <Alert variant="danger">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Petakan kota</CardTitle>
          <CardDescription>
            Isi nama kota. Sistem mencari kafe, resto, toko, dan salon di kota
            itu, lalu menampilkan yang potensial dipasangi kartu — sedikit
            ulasan Google, rating masih bisa naik.
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <InputGroup className="flex-1">
              <InputGroupInput
                aria-controls={listId}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Atau cari nama toko spesifik…"
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
          {places.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {scanMode === 'city' && scannedCity
                  ? `${places.length} toko potensial di ${scannedCity.name}`
                  : `${places.length} listing Google`}
              </p>
              <Button
                disabled={savingBatch || placesBusy}
                onClick={() => void onSavePotential()}
                type="button"
              >
                {savingBatch ? <Spinner data-icon="inline-start" /> : null}
                Simpan yang potensial
              </Button>
            </div>
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
                    </ItemContent>
                    <ItemActions className="ml-2 shrink-0">
                      <Button
                        disabled={placesBusy || savingId === place.placeId || saved}
                        onClick={() => void onSave(place)}
                        size="sm"
                        type="button"
                      >
                        {savingId === place.placeId ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        {saved ? 'Tersimpan' : 'Simpan prospek'}
                      </Button>
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
            Snapshot rating tersimpan di sini. Urutan default: paling sedikit
            ulasan dulu, supaya closing lebih cepat.
          </p>
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
                    | undefined,
                  page: undefined,
                },
              })
            }
            value={search.sort ?? 'reviews'}
          >
            <option value="reviews">Sedikit ulasan dulu</option>
            <option value="rating">Rating rendah dulu</option>
            <option value="recent">Terbaru</option>
          </Select>
        </div>

        {list.prospects.length === 0 ? (
          <Empty className="min-h-40 border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyTitle>Belum ada prospek</EmptyTitle>
              <EmptyDescription>
                Cari toko di atas, lalu simpan yang rating dan jumlah ulasannya
                masih rendah.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DataTable>
            <DataTableHead
              columns={[
                'Bisnis Google',
                'Rating sebelum kartu',
                'Status',
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
                      <Badge
                        variant={
                          row.status === 'WON'
                            ? 'success'
                            : row.status === 'CONTACTED'
                              ? 'accent'
                              : row.status === 'LOST'
                                ? 'muted'
                                : 'outline'
                        }
                      >
                        {PROSPECT_STATUS_LABEL[row.status]}
                      </Badge>
                      {row.status !== 'WON' ? (
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
                      {row.status !== 'WON' ? (
                        <Button
                          onClick={() => {
                            setAttachFor(row.id)
                            setPublicId(readyCards[0]?.publicId ?? '')
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Pasang kartu
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => setPendingDelete(row.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Hapus
                      </Button>
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

      {attachFor ? (
        <Card>
          <CardHeader>
            <CardTitle>Pasang ke kartu gudang</CardTitle>
            <CardDescription>
              Pilih kartu IN_STOCK. Listing Google, rating, dan jumlah ulasan
              saat ini ikut tersimpan sebagai kondisi sebelum kartu diisi.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="prospect-card">Kode kartu</FieldLabel>
              {readyCards.length > 0 ? (
                <Select
                  id="prospect-card"
                  onChange={(event) => setPublicId(event.target.value)}
                  value={publicId}
                >
                  <option value="">Pilih kartu siap pasang</option>
                  {readyCards.map((card) => (
                    <option key={card.id} value={card.publicId}>
                      {card.publicId}
                      {card.batchLabel ? ` · ${card.batchLabel}` : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="prospect-card"
                  onChange={(event) => setPublicId(event.target.value.toUpperCase())}
                  placeholder="Kode kartu"
                  value={publicId}
                />
              )}
            </Field>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              disabled={attaching || !publicId.trim()}
              onClick={() => void onAttach()}
              type="button"
            >
              {attaching ? <Spinner data-icon="inline-start" /> : null}
              Pasang kartu
            </Button>
            <Button
              onClick={() => {
                setAttachFor(null)
                setPublicId('')
              }}
              type="button"
              variant="ghost"
            >
              Batal
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      <ConfirmDelete
        confirmLabel="Hapus prospek"
        description="Prospek ini dihapus dari daftar. Kartu yang sudah terpasang tidak berubah."
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
