import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PageHeader } from '#/components/page'
import { canScanQr, QrCamera } from '#/components/qr-camera'
import { StatusBadge } from '#/components/ui/badge'
import { Alert } from '#/components/ui/alert'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { parseCode } from '#/lib/card-code'
import { canReadNfc, isIos, readNfcRaw } from '#/lib/nfc-write'
import { listMyUnitsFn } from '#/server/functions'

export const Route = createFileRoute('/app/')({
  loader: () => listMyUnitsFn(),
  component: MyCardsPage,
  head: () => ({
    meta: [{ title: 'Kartu saya — Ternak Review' }],
  }),
})

function MyCardsPage() {
  const holder = Route.useLoaderData()
  const navigate = useNavigate()
  const cards = holder?.cards ?? []
  const pending = cards.filter((card) => card.status === 'IN_STOCK')
  const installed = cards.filter((card) => card.status !== 'IN_STOCK')
  const [cameraOk, setCameraOk] = useState(false)
  const [nfcOk, setNfcOk] = useState(false)
  const [ios, setIos] = useState(false)
  const [scan, setScan] = useState('')
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastRaw = useRef('')

  useEffect(() => {
    setCameraOk(canScanQr())
    setNfcOk(canReadNfc())
    setIos(isIos())
  }, [])

  function openCard(raw: string) {
    let publicId: string
    try {
      publicId = parseCode(raw).id
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kode tidak valid.')
      return
    }
    if (lastRaw.current === publicId) return
    lastRaw.current = publicId
    setError(null)
    setPaused(true)
    const mine = cards.find((card) => card.publicId === publicId)
    if (mine && mine.status !== 'IN_STOCK') {
      void navigate({
        to: '/app/units/$unitId',
        params: { unitId: mine.id },
      })
      return
    }
    void navigate({
      to: '/activate',
      search: { id: publicId },
    })
  }

  async function onTyped(event: FormEvent) {
    event.preventDefault()
    openCard(scan)
  }

  async function onNfc() {
    setBusy(true)
    setError(null)
    try {
      openCard(await readNfcRaw())
    } catch (err) {
      lastRaw.current = ''
      setError(err instanceof Error ? err.message : 'Gagal membaca NFC.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description="Tempel atau scan kartu yang mau dipasang. Karena kamu sudah masuk, PIN tidak diminta."
        title="Kartu saya"
      />

      <Card>
        <CardHeader>
          <CardTitle>Pasang kartu di toko</CardTitle>
          <CardDescription>
            {pending.length > 0
              ? `${pending.length} kartu siap dipasang. Tempel atau scan yang ada di tangan, lalu pilih toko.`
              : 'Tidak ada kartu gudang. Kartu aktif tampil di bawah.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {nfcOk ? (
            <Button disabled={busy} onClick={() => void onNfc()} size="lg" type="button">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Tempel kartunya…' : 'Tempel NFC'}
            </Button>
          ) : ios ? (
            <p className="text-sm text-muted-foreground">
              iPhone: scan QR di bawah, atau tempel kartu ke HP supaya Safari
              membuka tautannya (kamu sudah masuk, PIN dilewati).
            </p>
          ) : null}
          {cameraOk ? (
            <QrCamera
              onCode={(raw) => {
                openCard(raw)
              }}
              paused={paused}
            />
          ) : null}
          <form className="flex flex-col gap-2" onSubmit={onTyped}>
            <InputGroup>
              <InputGroupInput
                onChange={(event) => {
                  lastRaw.current = ''
                  setPaused(false)
                  setScan(event.target.value)
                }}
                placeholder="Atau tempel tautan / kode kartu"
                value={scan}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton disabled={scan.trim().length < 8} type="submit">
                  Lanjut
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </CardContent>
      </Card>

      {installed.length === 0 ? (
        cards.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Belum ada kartu</EmptyTitle>
              <EmptyDescription>
                Minta admin assign kartu ke akun ini. Setelah itu tinggal tempel
                atau scan di toko.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Sudah terpasang</h2>
          <ul className="flex flex-col gap-2">
            {installed.map((card) => (
              <li key={card.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-accent/50"
                  params={{ unitId: card.id }}
                  to="/app/units/$unitId"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {card.outletName ?? card.publicId}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {card.publicId}
                    </p>
                  </div>
                  <StatusBadge status={card.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
