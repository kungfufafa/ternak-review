import { createFileRoute, Link, redirect, useRouteContext, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { HashIcon, PrinterIcon, SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AppUrlBanner } from '#/components/app-url-banner'
import { ConfirmDelete } from '#/components/confirm-delete'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { KitPreview } from '#/components/kit-preview'
import { PageHeader } from '#/components/page'
import { ProductionSteps } from '#/components/production-steps'
import { ViewCustomize, type ViewColumnDef } from '#/components/view-customize'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Input } from '#/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '#/components/ui/item'
import { Progress } from '#/components/ui/progress'
import { Spinner } from '#/components/ui/spinner'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '#/components/ui/toggle-group'
import { can } from '#/lib/access'
import { formatDay } from '#/lib/utils'
import {
  deleteStockBatchFn,
  generateStockFn,
  getAppUrlInfoFn,
  getCardDesignFn,
  getCurrentOwnerFn,
  getViewPrefsFn,
  listStockBatchesFn,
} from '#/server/functions'

const PRESETS = [25, 50, 100, 250, 500] as const

export const Route = createFileRoute('/admin/stock/')({
  loader: async () => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    const [batches, appUrl, prefs, cardDesign] = await Promise.all([
      listStockBatchesFn(),
      getAppUrlInfoFn(),
      getViewPrefsFn({ data: { view: 'stock' } }),
      getCardDesignFn(),
    ])
    return { batches, appUrl, prefs, cardDesign }
  },
  component: AdminStockPage,
  head: () => ({
    meta: [{ title: 'Produksi — Ternak Review' }],
  }),
})

const STOCK_COLUMNS: ViewColumnDef[] = [
  { key: 'label', label: 'Cetakan' },
  { key: 'date', label: 'Tanggal' },
  { key: 'remaining', label: 'Sisa kartu' },
  { key: 'available', label: 'Belum dialokasi' },
  { key: 'nfcWritten', label: 'NFC tertulis' },
  { key: 'pendingActivation', label: 'Menunggu aktivasi' },
  { key: 'active', label: 'Aktif' },
  { key: 'inactive', label: 'Nonaktif' },
]

function AdminStockPage() {
  const { batches, appUrl, prefs: savedPrefs, cardDesign } =
    Route.useLoaderData()
  const { owner } = useRouteContext({ from: '/admin' })
  const canHandoff = can(owner.permissions, 'holders.manage')
  const generate = useServerFn(generateStockFn)
  const removeBatch = useServerFn(deleteStockBatchFn)
  const router = useRouter()
  const readyRef = useRef<HTMLDivElement>(null)

  const [prefs, setPrefs] = useState(savedPrefs)
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(100)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lastBatchId, setLastBatchId] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    label: string
  } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const needle = query.trim().toLowerCase()
  const cardBatches = needle
    ? batches.filter((batch) => batch.label.toLowerCase().includes(needle))
    : batches
  const presetValue = PRESETS.includes(count as (typeof PRESETS)[number])
    ? String(count)
    : ''
  const made = lastCount ?? count
  const visibleColumns = STOCK_COLUMNS.filter((column) =>
    prefs.columns.includes(column.key),
  )

  useEffect(() => {
    if (!lastBatchId) return
    readyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [lastBatchId])

  function onAskGenerate(e: FormEvent) {
    e.preventDefault()
    const safe = Math.min(Math.max(Math.floor(count) || 0, 1), 1000)
    setCount(safe)
    setError(null)
    setConfirmOpen(true)
  }

  async function onGenerate() {
    setBusy(true)
    setError(null)
    try {
      const res = await generate({
        data: {
          count,
          label: label.trim() || undefined,
        },
      })
      setLastBatchId(res.batchId)
      setLastCount(res.count)
      setLabel('')
      setConfirmOpen(false)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat kartu')
    } finally {
      setBusy(false)
    }
  }

  function nfcBadge(batch: (typeof batches)[number]) {
    const next = batch.next
    const left = Math.max(0, batch.remaining - batch.encoded)
    if (batch.remaining === 0)
      return <Badge variant="muted">Cetakan kosong</Badge>
    if (next === 'ready') return <Badge variant="success">NFC selesai</Badge>
    if (next === 'nfc')
      return (
        <Badge variant="secondary">{left} NFC belum ditulis</Badge>
      )
    return <Badge variant="outline">NFC belum dimulai</Badge>
  }

  function nfcProgress(batch: (typeof batches)[number]) {
    if (batch.remaining === 0 || batch.next === 'print') return null
    const percent = Math.min(
      100,
      Math.round((batch.encoded / batch.remaining) * 100),
    )
    return (
      <div className="mt-2 flex items-center gap-2">
        <Progress className="h-1.5" value={percent} />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {percent}%
        </span>
      </div>
    )
  }

  function allocationStats(batch: (typeof batches)[number]) {
    const stats = [
      { label: 'belum dialokasikan', value: batch.available },
      { label: 'menunggu aktivasi', value: batch.assigned },
      { label: 'aktif', value: batch.active },
      { label: 'nonaktif', value: batch.inactive },
    ]
    return (
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {stats.map((stat) => (
          <span key={stat.label}>
            <span className="font-medium tabular-nums text-foreground">
              {stat.value}
            </span>{' '}
            {stat.label}
          </span>
        ))}
      </div>
    )
  }

  function batchActions(batch: (typeof batches)[number]) {
    const next = batch.next
    return (
      <>
        {batch.remaining === 0 ? null : next === 'ready' ? (
          <>
            {canHandoff ? (
              <Button asChild size="sm">
                <Link to="/admin/users/serah">Serahkan kartu</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant={canHandoff ? 'outline' : 'default'}>
              <Link
                search={{
                  batch: batch.id,
                  status: batch.inStock > 0 ? 'IN_STOCK' : undefined,
                  ownership: batch.available > 0 ? 'unassigned' : undefined,
                }}
                to="/dashboard/units"
              >
                {canHandoff || batch.available === 0 ? 'Kelola kartu' : 'Atur pemegang'}
              </Link>
            </Button>
          </>
        ) : next === 'nfc' ? (
          <Button asChild size="sm">
            <Link search={{ batch: batch.id }} to="/admin/stock/nfc">
              Tempel NFC
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild size="sm" variant="outline">
              <Link search={{ batch: batch.id }} to="/admin/stock/print">
                Cetak
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link search={{ batch: batch.id }} to="/admin/stock/nfc">
                Lanjut NFC
              </Link>
            </Button>
          </>
        )}
        {batch.active === 0 && batch.inactive === 0 && batch.assigned === 0 ? (
          <Button
            onClick={() =>
              setPendingDelete({ id: batch.id, label: batch.label })
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            Hapus
          </Button>
        ) : null}
      </>
    )
  }

  function stockCell(batch: (typeof batches)[number], key: string): {
    content: ReactNode
    muted?: boolean
  } {
    switch (key) {
      case 'label':
        return { content: batch.label }
      case 'date':
        return { content: formatDay(batch.createdAt), muted: true }
      case 'remaining':
        return {
          content:
            batch.remaining !== batch.count
              ? `${batch.remaining} / ${batch.count}`
              : batch.remaining,
          muted: true,
        }
      case 'available':
        return { content: batch.available }
      case 'nfcWritten':
        return { content: batch.encoded, muted: true }
      case 'pendingActivation':
        return { content: batch.assigned }
      case 'active':
        return { content: batch.active }
      case 'inactive':
        return { content: batch.inactive, muted: true }
      default:
        return { content: null }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-8">
      <PageHeader
        action={
          <ViewCustomize
            columns={STOCK_COLUMNS}
            onChange={setPrefs}
            prefs={prefs}
            view="stock"
            withMode
          />
        }
        description="Buat QR → cetak → tulis NFC → serahkan ke pemegang → aktivasi toko."
        title="Produksi"
      />

      <ProductionSteps
        batchId={lastBatchId ?? cardBatches[0]?.id}
        current={lastBatchId ? 2 : 1}
      />

      <AppUrlBanner info={appUrl} />

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {lastBatchId ? (
        <div ref={readyRef}>
          <Card>
            <CardHeader>
              <CardTitle>{made} QR sudah jadi</CardTitle>
              <CardDescription>
                Cetak kartu, lalu tempel NFC dengan HP. Jangan dijual sebelum
                NFC selesai.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild>
                <Link
                  search={{ batch: lastBatchId }}
                  to="/admin/stock/print"
                >
                  <PrinterIcon data-icon="inline-start" />
                  Cetak kartu
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}

      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-xs lg:mx-0">
          <KitPreview design={cardDesign} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Begini kartunya nanti, 9,8×9,8 cm
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Berapa kartu?</CardTitle>
            <CardDescription>
              Langkah 1: bikin QR. Setelah ini cetak, baru tempel NFC.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAskGenerate}>
              <FieldGroup className="gap-5">
                <Field>
                  <FieldLabel>Jumlah</FieldLabel>
                  <ToggleGroup
                    onValueChange={(value) => {
                      if (value) setCount(Number(value))
                    }}
                    spacing={2}
                    type="single"
                    value={presetValue}
                    variant="outline"
                  >
                    {PRESETS.map((n) => (
                      <ToggleGroupItem key={n} value={String(n)}>
                        {n}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <InputGroup>
                    <InputGroupInput
                      max={1000}
                      min={1}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (Number.isFinite(next)) setCount(next)
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      type="number"
                      value={count}
                    />
                    <InputGroupAddon align="inline-start">
                      <HashIcon />
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="batch-label">
                    Nama cetakan (opsional)
                  </FieldLabel>
                  <Input
                    id="batch-label"
                    maxLength={80}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Contoh: Kirim April"
                    value={label}
                  />
                  <FieldDescription>
                    Biar gampang bedain kalau cetak beberapa kali.
                  </FieldDescription>
                </Field>
                <Field>
                  <Button disabled={busy} type="submit">
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    {busy ? 'Membuat QR…' : `Bikin ${count} QR`}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium tracking-tight">Cetakan &amp; status kartu</h2>
          <InputGroup className="w-full max-w-xs">
            <InputGroupInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama cetakan"
              value={query}
            />
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <p className="text-sm text-muted-foreground">
          Progres NFC tercatat per kartu. Jika kartu sudah dicetak, langsung
          lanjut ke NFC. Kartu yang sudah dialokasikan dipisahkan dari stok tersedia.
        </p>
        {cardBatches.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {needle ? 'Tidak ada yang cocok' : 'Belum ada QR'}
              </EmptyTitle>
              <EmptyDescription>
                {needle
                  ? 'Coba kata kunci lain.'
                  : 'Pilih jumlah di atas. Setelah QR jadi, cetak dulu.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : prefs.mode === 'table' ? (
          <DataTable>
            <DataTableHead
              columns={[...visibleColumns.map((column) => column.label), '']}
              density={prefs.density}
            />
            <tbody>
              {cardBatches.map((batch) => (
                <tr
                  className={batch.id === lastBatchId ? 'bg-accent/40' : undefined}
                  key={batch.id}
                >
                  {visibleColumns.map((column) => {
                    const cell = stockCell(batch, column.key)
                    return (
                      <DataTableCell
                        density={prefs.density}
                        key={column.key}
                        muted={cell.muted}
                      >
                        {cell.content}
                      </DataTableCell>
                    )
                  })}
                  <DataTableCell density={prefs.density}>
                    <div className="flex flex-wrap justify-end gap-1">
                      {batchActions(batch)}
                    </div>
                  </DataTableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <ItemGroup className="rounded-2xl bg-card ring-1 ring-border">
            {cardBatches.map((batch) => (
              <Item
                className={batch.id === lastBatchId ? 'bg-accent' : undefined}
                key={batch.id}
              >
                <ItemContent>
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemTitle>{batch.label}</ItemTitle>
                    {nfcBadge(batch)}
                  </div>
                  <ItemDescription>
                    {formatDay(batch.createdAt)} ·{' '}
                    {batch.remaining !== batch.count
                      ? `${batch.remaining} dari ${batch.count} kartu`
                      : `${batch.remaining} kartu`}
                  </ItemDescription>
                  {batch.remaining > 0 ? (
                    <>
                      {nfcProgress(batch)}
                      {allocationStats(batch)}
                    </>
                  ) : null}
                </ItemContent>
                <ItemActions className="flex flex-wrap">
                  {batchActions(batch)}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bikin {count} QR?</AlertDialogTitle>
            <AlertDialogDescription>
              Kartu akan mengarah ke {appUrl.url}
              {label.trim() ? ` · ${label.trim()}` : ''}. Ini tidak bisa
              dibatalkan kecuali kamu hapus cetakannya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void onGenerate()
              }}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Membuat QR…' : `Bikin ${count}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDelete
        description={
          pendingDelete
            ? `${pendingDelete.label} dan kartunya yang masih di gudang akan dihapus.`
            : ''
        }
        onConfirm={async () => {
          if (!pendingDelete) return
          setDeleting(true)
          setError(null)
          try {
            const result = await removeBatch({
              data: { batchId: pendingDelete.id },
            })
            if (!result.ok) {
              setError(result.error)
              setPendingDelete(null)
              return
            }
            if (lastBatchId === pendingDelete.id) {
              setLastBatchId(null)
            }
            setPendingDelete(null)
            await router.invalidate({ sync: true })
          } finally {
            setDeleting(false)
          }
        }}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
        pending={deleting}
        title="Hapus cetakan?"
      />
    </div>
  )
}
