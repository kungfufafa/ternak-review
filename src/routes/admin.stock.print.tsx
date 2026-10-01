import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { FileDownIcon, PrinterIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { AppUrlBanner } from '#/components/app-url-banner'
import { ProductionSteps } from '#/components/production-steps'
import { ReviewCard } from '#/components/review-card'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '#/components/ui/toggle-group'
import {
  buildPrintPdf,
  downloadBytes,
  printPdfFilename,
} from '#/lib/card-pdf'
import { cardQrMap } from '#/lib/qr'
import { chunk, cn } from '#/lib/utils'
import {
  getAppUrlInfoFn,
  getBatchPrintFn,
  getCardDesignFn,
  getCurrentOwnerFn,
} from '#/server/functions'

type PrintLayout = 'sheet' | 'a4'

const CARDS_PER_A4 = 4
const PRINT_RANGE_DEFAULT = 500

export const Route = createFileRoute('/admin/stock/print')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { batch: string; layout?: PrintLayout } => ({
    batch: typeof search.batch === 'string' ? search.batch : '',
    ...(search.layout === 'a4' ? { layout: 'a4' as const } : {}),
  }),
  loaderDeps: ({ search }) => ({ batch: search.batch }),
  loader: async ({ deps }) => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    if (!deps.batch) throw redirect({ to: '/admin/stock' })
    const [pack, appUrl, cardDesign] = await Promise.all([
      getBatchPrintFn({ data: { batchId: deps.batch } }),
      getAppUrlInfoFn(),
      getCardDesignFn(),
    ])
    return { ...pack, appUrl, cardDesign }
  },
  component: StockPrintPage,
  head: () => ({
    meta: [{ title: 'Cetak — Produksi' }],
  }),
})

function StockPrintPage() {
  const { batch, units, appUrl, cardDesign } = Route.useLoaderData()
  const { layout: layoutParam } = Route.useSearch()
  const layout: PrintLayout = layoutParam === 'a4' ? 'a4' : 'sheet'
  const navigate = useNavigate({ from: '/admin/stock/print' })
  const a4 = layout === 'a4'

  const [marks, setMarks] = useState<Record<string, string>>({})
  const [readyCount, setReadyCount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(Math.min(units.length, PRINT_RANGE_DEFAULT))
  const [printNonce, setPrintNonce] = useState(0)
  const [trial, setTrial] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    setFrom(1)
    setTo(Math.min(units.length, PRINT_RANGE_DEFAULT))
    setMarks({})
    setReadyCount(0)
  }, [units])

  const ranged = useMemo(() => {
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    return units.filter((unit, index) => {
      const seq = unit.batchSeq ?? index + 1
      return seq >= start && seq <= end
    })
  }, [from, to, units])

  useEffect(() => {
    let cancelled = false
    async function build() {
      setMarks({})
      setReadyCount(0)
      const next = await cardQrMap(ranged, (done) => {
        if (!cancelled) setReadyCount(done)
      })
      if (!cancelled) setMarks(next)
    }
    void build()
    return () => {
      cancelled = true
    }
  }, [ranged])

  const qrReady =
    ranged.length > 0 &&
    ranged.every((unit) => Boolean(marks[unit.publicId]))
  const maxSeq = units.length

  const trialCount = a4 ? CARDS_PER_A4 : 1
  const printUnits = trial ? ranged.slice(0, trialCount) : ranged
  const a4Pages = a4 ? chunk(printUnits, CARDS_PER_A4) : []
  const previewUnits = ranged.slice(0, a4 ? CARDS_PER_A4 : 1)

  useLayoutEffect(() => {
    if (printNonce === 0) return
    const overlays = document.querySelectorAll<HTMLElement>(
      '[data-tsd-control], [data-tsd-surface], [aria-label="Open TanStack Devtools"], .tsqd-open-btn-container, .tsqd-open-btn',
    )
    const previous = new Map<HTMLElement, string>()
    overlays.forEach((el) => {
      previous.set(el, el.style.display)
      el.style.display = 'none'
    })
    window.print()
    overlays.forEach((el) => {
      el.style.display = previous.get(el) ?? ''
    })
  }, [printNonce])

  useEffect(() => {
    function onAfterPrint() {
      setTrial(false)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  function clampRange(nextFrom: number, nextTo: number) {
    const safeFrom = Math.min(Math.max(1, nextFrom), maxSeq || 1)
    const safeTo = Math.min(Math.max(safeFrom, nextTo), maxSeq || 1)
    setFrom(safeFrom)
    setTo(safeTo)
  }

  const paperHint = a4
    ? '4 kartu per A4. Percobaan mencetak 1 lembar (4 kartu) supaya tidak bergeser.'
    : '1 kartu 9,8×9,8 cm di kertas 10×10 cm, untuk vendor.'

  async function onDownloadCorel() {
    if (ranged.length === 0) return
    setExporting(true)
    setExportDone(0)
    setExportError(null)
    try {
      const bytes = await buildPrintPdf({
        cards: ranged,
        design: cardDesign,
        layout,
        onProgress: (done) => setExportDone(done),
      })
      downloadBytes(
        bytes,
        printPdfFilename(batch.label, ranged.length),
        'application/pdf',
      )
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Gagal membuat file percetakan.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-background text-foreground">
      <style>
        {a4
          ? '@page { size: A4; margin: 0; }'
          : '@page { size: 100mm 100mm; margin: 0; }'}
      </style>

      <div className="print-hide flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
            Cetak <em className="text-pine italic">kartu</em>
          </h1>
          <p className="max-w-lg text-muted-foreground">
            {batch.label} · {ranged.length} dari {units.length}
            {a4 ? ' · A4 isi 4' : ' · 9,8×9,8 cm'}
          </p>
        </div>

        <ProductionSteps batchId={batch.id} current={2} />

        <AppUrlBanner info={appUrl} />

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!qrReady}
            onClick={() => {
              setTrial(true)
              setPrintNonce((n) => n + 1)
            }}
            type="button"
            variant="outline"
          >
            {a4 ? 'Percobaan 1 lembar' : 'Percobaan'}
          </Button>
          <Button
            disabled={!qrReady}
            onClick={() => {
              setTrial(false)
              setPrintNonce((n) => n + 1)
            }}
            type="button"
          >
            {qrReady ? (
              <PrinterIcon data-icon="inline-start" />
            ) : (
              <Spinner data-icon="inline-start" />
            )}
            {qrReady ? `Cetak ${ranged.length}` : 'Menyiapkan QR…'}
          </Button>
          <Button
            disabled={exporting || ranged.length === 0}
            onClick={() => void onDownloadCorel()}
            type="button"
            variant="outline"
          >
            {exporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <FileDownIcon data-icon="inline-start" />
            )}
            {exporting
              ? `Menyusun ${exportDone}/${ranged.length}…`
              : `Unduh CorelDRAW · ${ranged.length} kartu`}
          </Button>
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Satu file berisi semua kartu di rentang ini. Kirim ke percetakan —
          buka di CorelDRAW (File → Buka). Tiap halaman satu kartu 10×10 cm
          {a4 ? ', atau 4 kartu per A4' : ''}.
        </p>
        {exportError ? (
          <p className="text-sm text-destructive">{exportError}</p>
        ) : null}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
            <section className="rounded-2xl bg-card p-6 sm:p-10">
              <p className="mb-6 text-sm text-muted-foreground">
                Pratinjau. Yang dicetak: {ranged.length} kartu.
              </p>
              <div
                className={cn(
                  'mx-auto grid w-full justify-items-center gap-6',
                  a4 ? 'max-w-xl grid-cols-2' : 'max-w-sm grid-cols-1',
                )}
              >
                {previewUnits.map((unit) => (
                  <div className="w-full" key={unit.publicId}>
                    <div className="relative">
                      <div className="review-card-scale">
                        <ReviewCard
                          design={cardDesign}
                          qrSvg={marks[unit.publicId]}
                        />
                      </div>
                      {qrReady ? null : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[12%] bg-background/80 text-sm text-muted-foreground">
                          <Spinner />
                          QR {readyCount}/{ranged.length}
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-center font-mono text-xs text-muted-foreground">
                      {unit.publicId}
                      {unit.batchSeq ? ` · ${unit.batchSeq}/${batch.count}` : ''}
                    </p>
                  </div>
                ))}
              </div>
              {ranged.length > previewUnits.length ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Pratinjau {previewUnits.length} kartu. Saat dicetak, semua{' '}
                  {ranged.length} ikut.
                </p>
              ) : null}
            </section>

            <aside className="flex flex-col gap-6 lg:sticky lg:top-28">
              <div className="rounded-2xl bg-card p-5">
                <FieldGroup className="gap-5">
                  <Field>
                    <FieldLabel>Kertas</FieldLabel>
                    <ToggleGroup
                      className="flex-wrap"
                      onValueChange={(value) => {
                        if (!value) return
                        void navigate({
                          search: (prev) => ({
                            ...prev,
                            layout: value === 'a4' ? 'a4' : undefined,
                          }),
                        })
                      }}
                      spacing={2}
                      type="single"
                      value={layout}
                      variant="outline"
                    >
                      <ToggleGroupItem value="sheet">9,8×9,8 cm</ToggleGroupItem>
                      <ToggleGroupItem value="a4">A4 isi 4</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="print-from">Dari</FieldLabel>
                      <Input
                        id="print-from"
                        max={maxSeq}
                        min={1}
                        onChange={(e) => clampRange(Number(e.target.value), to)}
                        type="number"
                        value={from}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="print-to">Sampai</FieldLabel>
                      <Input
                        id="print-to"
                        max={maxSeq}
                        min={1}
                        onChange={(e) => clampRange(from, Number(e.target.value))}
                        type="number"
                        value={to}
                      />
                    </Field>
                  </div>
                  {units.length > ranged.length ? (
                    <Button
                      onClick={() => clampRange(1, maxSeq)}
                      type="button"
                      variant="outline"
                    >
                      Semua {units.length}
                    </Button>
                  ) : null}
                  <FieldDescription>
                    {paperHint}
                    {units.length > PRINT_RANGE_DEFAULT
                      ? ` Batch besar: default ${PRINT_RANGE_DEFAULT} kartu. Ubah rentang atau pilih Semua.`
                      : ''}
                  </FieldDescription>
                </FieldGroup>
              </div>

              <div className="rounded-2xl bg-accent p-5 text-accent-foreground">
                <p className="font-medium">Sudah cetak?</p>
                <p className="mt-1 text-sm">
                  Tempel tag NFC, scan QR kartu, lalu tulis dengan HP. Setelah
                  penulisan NFC selesai, serahkan kartu ke pemegang dengan scan.
                </p>
                <Button asChild className="mt-4">
                  <Link search={{ batch: batch.id }} to="/admin/stock/nfc">
                    Lanjut tempel NFC
                  </Link>
                </Button>
              </div>
            </aside>
          </div>
      </div>

      <div className="print-only">
        {a4
          ? a4Pages.map((page, pageIndex) => (
              <section className="print-a4-sheet" key={pageIndex}>
                {page.map((unit) => (
                  <div className="review-card-print-wrap" key={unit.publicId}>
                    <ReviewCard
                      design={cardDesign}
                      qrSvg={marks[unit.publicId]}
                    />
                  </div>
                ))}
              </section>
            ))
          : printUnits.map((unit) => (
              <div className="review-card-print-wrap" key={unit.publicId}>
                <ReviewCard
                  design={cardDesign}
                  qrSvg={marks[unit.publicId]}
                />
              </div>
            ))}
      </div>
    </div>
  )
}
