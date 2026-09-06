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
  const active = cards.filter((card) => card.status === 'ACTIVE')
  const inactive = cards.filter((card) => card.status === 'INACTIVE')
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
        description="Pilih kartu yang belum diaktifkan untuk menghubungkannya ke toko, atau buka kartu aktif untuk mengelola toko."
        title="Kartu saya"
      />

      {cards.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada kartu di akun ini</EmptyTitle>
            <EmptyDescription>
              Minta admin menghubungkan kartu ke akun ini. Jika sudah memegang
              kartu fisik, kamu juga bisa memindainya di bawah untuk memeriksa
              akses aktivasi.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Belum diaktifkan ({pending.length})</h2>
          <p className="text-sm text-muted-foreground">
            Cocokkan kode dengan kartu fisik yang ingin dipasang, lalu pilih toko.
            Kartu milik akun ini tidak memerlukan PIN selama kamu tetap masuk di
            browser ini.
          </p>
          <ul className="flex flex-col gap-2">
            {pending.map((card) => (
              <li className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border" key={card.id}>
                <span className="font-mono text-sm">{card.publicId}</span>
                <Button asChild size="sm">
                  <Link search={{ id: card.publicId }} to="/activate">Pilih toko</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {[
        { title: 'Aktif', cards: active },
        { title: 'Nonaktif', cards: inactive },
      ].map((group) => group.cards.length > 0 ? (
        <section className="flex flex-col gap-3" key={group.title}>
          <h2 className="font-medium">{group.title} ({group.cards.length})</h2>
          {group.title === 'Nonaktif' ? (
            <p className="text-sm text-muted-foreground">
              Tamu belum bisa memakai kartu ini. Hubungi admin untuk mengaktifkannya kembali.
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {group.cards.map((card) => (
              <li key={card.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-accent/50"
                  params={{ unitId: card.id }}
                  to="/app/units/$unitId"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{card.outletName ?? card.publicId}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{card.publicId}</p>
                  </div>
                  <StatusBadge status={card.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null)}

      <Card>
        <CardHeader>
          <CardTitle>Pindai kartu di tangan</CardTitle>
          <CardDescription>
            Gunakan NFC, kamera QR, atau masukkan kode untuk membuka kartu.
            Jika kartu belum ditetapkan ke akun ini, alur akun dapat meminta PIN
            pemegang. Tautan publik untuk kartu tanpa pemegang bisa langsung
            memilih toko.
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
              iPhone: pindai QR di bawah, atau tempel kartu ke HP untuk membuka
              tautannya. Jika tautan terbuka di browser lain, kamu mungkin perlu
              masuk lagi atau memakai PIN pemegang.
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
                aria-label="Tautan atau kode kartu"
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
    </div>
  )
}
