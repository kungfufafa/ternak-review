import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AppUrlBanner } from '#/components/app-url-banner'
import { ProductionSteps } from '#/components/production-steps'
import { canScanQr, QrCamera } from '#/components/qr-camera'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Progress } from '#/components/ui/progress'
import { Spinner } from '#/components/ui/spinner'
import { canWriteNfc, isIos, writeNfcUrl } from '#/lib/nfc-write'
import {
  getAppUrlInfoFn,
  getBatchPrintFn,
  getCurrentOwnerFn,
  lookupQrFn,
  markNfcEncodedFn,
  listStockBatchesFn,
} from '#/server/functions'

type LockedCard = {
  publicId: string
  redirectUrl: string
  batchId: string | null
  batchLabel: string | null
  batchSeq: number | null
  nfcEncodedAt: Date | number | null
}

export const Route = createFileRoute('/admin/stock/nfc')({
  validateSearch: (search: Record<string, unknown>): { batch?: string } => {
    if (typeof search.batch === 'string' && search.batch.length > 0) {
      return { batch: search.batch }
    }
    return {}
  },
  loaderDeps: ({ search }) => ({ batch: search.batch }),
  loader: async ({ deps }) => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    const appUrl = await getAppUrlInfoFn()
    if (!deps.batch) return { run: null, appUrl }
    try {
      const [data, batches] = await Promise.all([
        getBatchPrintFn({ data: { batchId: deps.batch } }),
        listStockBatchesFn(),
      ])
      const encoded = data.units.filter((unit) => unit.nfcEncodedAt).length
      const summary = batches.find((batch) => batch.id === data.batch.id)
      return {
        appUrl,
        run: {
          id: data.batch.id,
          label: data.batch.label,
          count: data.units.length,
          encoded,
          inStock: summary?.inStock ?? data.units.filter((unit) => unit.status === 'IN_STOCK').length,
          available: summary?.available ?? 0,
          assigned: summary?.assigned ?? 0,
        },
      }
    } catch {
      return { run: null, appUrl }
    }
  },
  component: NfcPage,
  head: () => ({
    meta: [{ title: 'Tempel NFC — Produksi' }],
  }),
})

function friendlyNfcError(err: unknown) {
  const name = err instanceof DOMException ? err.name : ''
  const message = err instanceof Error ? err.message : ''
  if (name === 'AbortError' || /abort/i.test(message)) {
    return 'Batal. Tekan lagi setelah stiker nempel.'
  }
  if (name === 'NotAllowedError') {
    return 'Izinkan NFC di Chrome, lalu tekan lagi.'
  }
  if (message) return message
  return 'Belum ke-tap. Tempel HP lebih dekat ke stiker.'
}

function NfcPage() {
  const { run, appUrl } = Route.useLoaderData()
  const lookup = useServerFn(lookupQrFn)
  const markEncoded = useServerFn(markNfcEncodedFn)

  const [nfcOk, setNfcOk] = useState(false)
  const [ios, setIos] = useState(false)
  const [cameraOk, setCameraOk] = useState(false)
  const [copied, setCopied] = useState(false)
  const [scan, setScan] = useState('')
  const [card, setCard] = useState<LockedCard | null>(null)
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [sessionDone, setSessionDone] = useState(0)
  const [runEncoded, setRunEncoded] = useState(run?.encoded ?? 0)
  const formRef = useRef<HTMLFormElement>(null)
  const lastRaw = useRef('')
  const cardRef = useRef<LockedCard | null>(null)

  function focusScan() {
    formRef.current?.querySelector('input')?.focus()
  }

  useEffect(() => {
    setNfcOk(canWriteNfc())
    setIos(isIos())
    setCameraOk(canScanQr())
    focusScan()
  }, [])

  useEffect(() => {
    cardRef.current = card
  }, [card])

  function celebrate(cardDone: LockedCard, already: boolean) {
    setSessionDone((n) => n + (already ? 0 : 1))
    if (run && !already && cardDone.batchId === run.id) {
      setRunEncoded((n) => Math.min(run.count, n + 1))
    }
    setFlash(cardDone.publicId)
    setCard(null)
    cardRef.current = null
    lastRaw.current = ''
    try {
      navigator.vibrate?.(40)
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      setFlash(null)
      focusScan()
    }, 700)
  }

  async function identify(raw: string) {
    const ref = raw.trim()
    if (ref.length < 4 || busy || writing) return
    if (cardRef.current && ref.toUpperCase().includes(cardRef.current.publicId)) {
      return
    }
    if (ref === lastRaw.current) return
    lastRaw.current = ref
    setBusy(true)
    setError(null)
    try {
      const found = await lookup({ data: { ref } })
      const locked: LockedCard = {
        publicId: found.publicId,
        redirectUrl: found.redirectUrl,
        batchId: found.batchId,
        batchLabel: found.batchLabel,
        batchSeq: found.batchSeq,
        nfcEncodedAt: found.nfcEncodedAt,
      }
      setCard(locked)
      setScan('')
    } catch (err) {
      lastRaw.current = ''
      setError(err instanceof Error ? err.message : 'QR tidak dikenali')
    } finally {
      setBusy(false)
    }
  }

  async function writeCard(target: LockedCard) {
    setWriting(true)
    setError(null)
    const already = Boolean(target.nfcEncodedAt)
    try {
      await writeNfcUrl(target.redirectUrl)
      await markEncoded({ data: { ref: target.publicId } })
      celebrate(target, already)
    } catch (err) {
      setError(friendlyNfcError(err))
    } finally {
      setWriting(false)
    }
  }

  async function onScanSubmit(event: FormEvent) {
    event.preventDefault()
    const ref = scan.trim()
    if (ref.length < 4) return
    setBusy(true)
    setError(null)
    try {
      const found = await lookup({ data: { ref } })
      const locked: LockedCard = {
        publicId: found.publicId,
        redirectUrl: found.redirectUrl,
        batchId: found.batchId,
        batchLabel: found.batchLabel,
        batchSeq: found.batchSeq,
        nfcEncodedAt: found.nfcEncodedAt,
      }
      setCard(locked)
      setScan('')
      if (nfcOk) {
        setBusy(false)
        await writeCard(locked)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR tidak dikenali')
    } finally {
      setBusy(false)
      focusScan()
    }
  }

  const runLeft = run ? Math.max(0, run.count - runEncoded) : null
  const completionTarget = run
    ? run.available > 0
      ? {
          label: 'Tentukan pemegang',
          search: {
            batch: run.id,
            status: 'IN_STOCK' as const,
            ownership: 'unassigned' as const,
          },
        }
      : run.assigned > 0
        ? {
            label: 'Lihat aktivasi pemegang',
            search: {
              batch: run.id,
              status: 'IN_STOCK' as const,
              ownership: 'assigned' as const,
            },
          }
        : {
            label: 'Kelola kartu',
            search: { batch: run.id },
          }
    : null

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
          Tempel <em className="text-pine italic">NFC</em>
        </h1>
        <p className="max-w-lg text-muted-foreground">
          Scan QR kartu yang kamu pegang, lalu tulis ke stikernya. Urutan acak
          tidak masalah.
        </p>
      </div>

      <ProductionSteps batchId={run?.id} current={3} />

      <AppUrlBanner info={appUrl} />

      <div className="flex max-w-md flex-col gap-6">

      {run ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{run.label}</span>
            <span className="tabular-nums">
              {runLeft === 0
                ? 'Penulisan NFC selesai'
                : `${runLeft} kartu belum tertulis`}
            </span>
          </div>
          <Progress
            value={run.count > 0 ? (runEncoded / run.count) * 100 : 0}
          />
          {runLeft === 0 && completionTarget ? (
            <div className="mt-3 rounded-xl bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                Penulisan NFC selesai. Lanjutkan proses sebelum kartu
                diserahkan ke toko.
              </p>
              <Button asChild className="mt-3" size="sm">
                <Link
                  search={completionTarget.search}
                  to="/dashboard/units"
                >
                  {completionTarget.label}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : sessionDone > 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          {sessionDone} kartu tertulis sesi ini
        </p>
      ) : null}

      {flash ? (
        <Alert variant="success">
          {flash} sudah ditulis ke NFC. Ambil kartu berikutnya.
        </Alert>
      ) : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {cameraOk ? (
        <QrCamera
          onCode={(raw) => void identify(raw)}
          paused={writing || Boolean(card)}
        />
      ) : null}

      <form onSubmit={(event) => void onScanSubmit(event)} ref={formRef}>
        <InputGroup>
          <InputGroupInput
            autoComplete="off"
            autoFocus
            onChange={(event) => setScan(event.target.value)}
            placeholder="Scan QR kartu atau tempel kode"
            value={scan}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton disabled={busy || scan.trim().length < 4} type="submit">
              {busy ? <Spinner /> : 'Pakai'}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>

      {card ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-card px-6 py-8 text-center">
          {writing ? (
            <span className="size-20 animate-pulse rounded-full bg-accent" />
          ) : null}
          <p className="font-mono text-3xl tracking-[0.18em]">{card.publicId}</p>
          <p className="text-sm text-muted-foreground">
            {card.batchLabel ?? 'Kartu'}
            {card.batchSeq ? ` · ${card.batchSeq}` : ''}
            {card.nfcEncodedAt ? ' · sudah pernah, tulis ulang' : ''}
          </p>
          {nfcOk ? (
            <Button
              className="w-full"
              disabled={writing}
              onClick={() => void writeCard(card)}
              size="lg"
              type="button"
            >
              {writing ? <Spinner data-icon="inline-start" /> : null}
              {writing ? 'Tempel HP ke stiker' : 'Tempel HP'}
            </Button>
          ) : (
            <div className="flex w-full flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {ios
                  ? 'iPhone tidak bisa nulis NFC dari Safari. Pakai app Ternak Review (folder mobile/), atau salin URL ke NFC Tools. Android Chrome tetap bisa nulis langsung dari halaman ini.'
                  : 'Nulis stiker dari browser cuma di Chrome Android. Salin URL ini, buka halaman ini di HP Android, atau pakai app Ternak Review.'}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {card.redirectUrl}
              </p>
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(card.redirectUrl)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1500)
                  } catch {
                    setError('Gagal menyalin. Salin URL di atas manual.')
                  }
                }}
                size="lg"
                type="button"
                variant="outline"
              >
                {copied ? 'URL tersalin' : 'Salin URL'}
              </Button>
              <Button
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await markEncoded({ data: { ref: card.publicId } })
                    celebrate(card, Boolean(card.nfcEncodedAt))
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Gagal menandai',
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
                type="button"
              >
                Sudah nulis — kartu berikutnya
              </Button>
            </div>
          )}
          <button
            className="text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setCard(null)
              lastRaw.current = ''
              focusScan()
            }}
            type="button"
          >
            Bukan kartu ini
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Pegang kartu mana saja. Scan QR-nya — jangan andalkan urutan tumpukan.
        </p>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link className="underline underline-offset-4" to="/admin/stock">
          Ke produksi
        </Link>
      </p>
      </div>
    </div>
  )
}
