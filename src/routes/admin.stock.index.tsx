import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { HashIcon, PrinterIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AppUrlBanner } from '#/components/app-url-banner'
import { ConfirmDelete } from '#/components/confirm-delete'
import { KitPreview } from '#/components/kit-preview'
import { ProductionSteps } from '#/components/production-steps'
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
import { Spinner } from '#/components/ui/spinner'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '#/components/ui/toggle-group'
import { formatDay } from '#/lib/utils'
import {
  deleteStockBatchFn,
  generateStockFn,
  getAppUrlInfoFn,
  getCurrentOwnerFn,
  listStockBatchesFn,
} from '#/server/functions'

const PRESETS = [25, 50, 100, 250, 500] as const

export const Route = createFileRoute('/admin/stock/')({
  loader: async () => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    const [batches, appUrl] = await Promise.all([
      listStockBatchesFn(),
      getAppUrlInfoFn(),
    ])
    return { batches, appUrl }
  },
  component: AdminStockPage,
  head: () => ({
    meta: [{ title: 'Produksi — Ternak Review' }],
  }),
})

function AdminStockPage() {
  const { batches, appUrl } = Route.useLoaderData()
  const generate = useServerFn(generateStockFn)
  const removeBatch = useServerFn(deleteStockBatchFn)
  const router = useRouter()
  const readyRef = useRef<HTMLDivElement>(null)

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

  const cardBatches = batches
  const presetValue = PRESETS.includes(count as (typeof PRESETS)[number])
    ? String(count)
    : ''
  const made = lastCount ?? count

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

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
          <em className="text-pine italic">Produksi</em>
        </h1>
        <p className="max-w-lg text-muted-foreground">
          Buat QR → cetak → tulis NFC → tentukan pemegang → aktivasi toko.
        </p>
      </div>

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
          <KitPreview />
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
        <h2 className="font-medium tracking-tight">Cetakan &amp; status kartu</h2>
        <p className="text-sm text-muted-foreground">
          Progres NFC tercatat per kartu. Jika kartu sudah dicetak, langsung
          lanjut ke NFC. Kartu yang sudah dialokasikan dipisahkan dari stok tersedia.
        </p>
        {cardBatches.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Belum ada QR</EmptyTitle>
              <EmptyDescription>
                Pilih jumlah di atas. Setelah QR jadi, cetak dulu.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="rounded-2xl bg-card ring-1 ring-border">
            {cardBatches.map((batch) => {
              const next = batch.next
              const left = Math.max(0, batch.remaining - batch.encoded)
              return (
                <Item
                  className={batch.id === lastBatchId ? 'bg-accent' : undefined}
                  key={batch.id}
                >
                  <ItemContent>
                    <ItemTitle>{batch.label}</ItemTitle>
                    <ItemDescription>
                      {formatDay(batch.createdAt)} · {batch.remaining} kartu
                      tercatat
                      {batch.remaining !== batch.count
                        ? ` dari ${batch.count}`
                        : ''}
                      {batch.remaining === 0
                        ? ' · cetakan kosong'
                        : next === 'ready'
                          ? ' · NFC selesai'
                          : next === 'nfc'
                            ? ` · ${left} NFC belum ditulis`
                            : ' · NFC belum dimulai'}
                    </ItemDescription>
                    {batch.remaining > 0 ? (
                      <ItemDescription>
                        {batch.available} belum dialokasikan ({batch.readyStock} NFC
                        tertulis) · {batch.assigned} menunggu aktivasi ·{' '}
                        {batch.active} aktif · {batch.inactive} nonaktif
                      </ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions className="flex flex-wrap">
                    {batch.remaining === 0 ? null : next === 'ready' ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          search={{
                            batch: batch.id,
                            status: batch.inStock > 0 ? 'IN_STOCK' : undefined,
                            ownership:
                              batch.available > 0 ? 'unassigned' : undefined,
                          }}
                          to="/dashboard/units"
                        >
                          {batch.available > 0 ? 'Atur pemegang' : 'Kelola kartu'}
                        </Link>
                      </Button>
                    ) : next === 'nfc' ? (
                      <Button asChild size="sm">
                        <Link
                          search={{ batch: batch.id }}
                          to="/admin/stock/nfc"
                        >
                          Tempel NFC
                        </Link>
                      </Button>
                    ) : (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            search={{ batch: batch.id }}
                            to="/admin/stock/print"
                          >
                            Cetak
                          </Link>
                        </Button>
                        <Button asChild size="sm">
                          <Link
                            search={{ batch: batch.id }}
                            to="/admin/stock/nfc"
                          >
                            Lanjut NFC
                          </Link>
                        </Button>
                      </>
                    )}
                    {batch.active === 0 &&
                    batch.inactive === 0 &&
                    batch.assigned === 0 ? (
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
                  </ItemActions>
                </Item>
              )
            })}
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
