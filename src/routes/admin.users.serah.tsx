import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page'
import { canScanQr, QrCamera } from '#/components/qr-camera'
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
  InputGroupButton,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { can } from '#/lib/access'
import {
  assignUnitToHolderFn,
  getCurrentOwnerFn,
  getHolderHandoffFn,
  listAssignableHoldersFn,
  previewHandoffFn,
} from '#/server/functions'

type HolderChoice = Awaited<ReturnType<typeof listAssignableHoldersFn>>[number]
type HandoffUser = NonNullable<Awaited<ReturnType<typeof getHolderHandoffFn>>>
type PendingMove = {
  unitId: string
  publicId: string
  fromName: string
}

export const Route = createFileRoute('/admin/users/serah')({
  validateSearch: (search: Record<string, unknown>): { holder?: string } => {
    const holder = typeof search.holder === 'string' ? search.holder : ''
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        holder,
      )
    ) {
      return { holder }
    }
    return {}
  },
  loaderDeps: ({ search }) => ({ holder: search.holder }),
  loader: async ({ deps }) => {
    const owner = await getCurrentOwnerFn()
    const canHandoff = Boolean(owner && can(owner.permissions, 'holders.manage'))
    if (!deps.holder) {
      const holders = canHandoff ? await listAssignableHoldersFn() : []
      return { canHandoff, user: null, holders }
    }
    const user = await getHolderHandoffFn({ data: { userId: deps.holder } })
    if (!user) throw notFound()
    return { canHandoff, user, holders: [] as HolderChoice[] }
  },
  component: HandoffPage,
  head: () => ({
    meta: [{ title: 'Serahkan kartu — Ternak Review' }],
  }),
})

function labelOf(holder: { name: string | null; email: string }) {
  const name = holder.name?.trim()
  return name && name.length > 0 ? name : holder.email
}

function HandoffPage() {
  const { canHandoff, user, holders } = Route.useLoaderData()
  if (!canHandoff) {
    return (
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6">
        <PageHeader
          description="Menyerahkan kartu memakai izin mengubah akun pemegang."
          title="Serahkan kartu"
        />
      </div>
    )
  }
  if (!user) return <HolderPicker holders={holders} />
  return <ScanStation user={user} />
}

function HolderPicker({ holders }: { holders: HolderChoice[] }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = holders.filter((holder) => {
    if (!needle) return true
    return (
      (holder.name ?? '').toLowerCase().includes(needle) ||
      holder.email.toLowerCase().includes(needle) ||
      (holder.whatsapp ?? '').toLowerCase().includes(needle)
    )
  })

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6">
      <PageHeader
        description="Pilih pemegang, lalu scan kartu yang jadi miliknya. Jumlah bebas."
        title="Serahkan kartu"
      />
      {holders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada akun pemegang aktif</EmptyTitle>
            <EmptyDescription>
              Buat akun dulu, lalu kembali ke sini untuk scan kartunya.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link to="/admin/users">Buat akun pemegang</Link>
          </Button>
        </Empty>
      ) : (
        <div className="flex max-w-md flex-col gap-3">
          <InputGroup>
            <InputGroupInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama atau email"
              value={query}
            />
          </InputGroup>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada yang cocok.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((holder) => (
                <li key={holder.id}>
                  <Link
                    className="flex flex-col rounded-xl border border-border px-4 py-3 hover:bg-muted/50"
                    search={{ holder: holder.id }}
                    to="/admin/users/serah"
                  >
                    <span className="font-medium">{labelOf(holder)}</span>
                    {holder.whatsapp || holder.name?.trim() ? (
                      <span className="text-sm text-muted-foreground">
                        {holder.whatsapp || holder.email}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ScanStation({ user }: { user: HandoffUser }) {
  const navigate = useNavigate({ from: '/admin/users/serah' })
  const preview = useServerFn(previewHandoffFn)
  const assign = useServerFn(assignUnitToHolderFn)
  const [cameraOk, setCameraOk] = useState(false)
  const [scan, setScan] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null)
  const [session, setSession] = useState<string[]>([])
  const [pending, setPending] = useState<PendingMove | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const lastRaw = useRef('')
  const busyRef = useRef(false)

  const active = user.status === 'ACTIVE'
  const held = user.cardCount + session.length

  useEffect(() => {
    setCameraOk(canScanQr())
    formRef.current?.querySelector('input')?.focus()
  }, [])

  function remember(publicId: string) {
    setSession((current) => [publicId, ...current.filter((id) => id !== publicId)])
    setFlash({
      text: `${publicId} diserahkan. Ambil kartu berikutnya.`,
      ok: true,
    })
    try {
      navigator.vibrate?.(40)
    } catch {
      // ignore
    }
  }

  async function accept(raw: string, force = false) {
    const ref = raw.trim()
    if (!active || ref.length < 4 || busyRef.current || pending) return
    if (!force && ref === lastRaw.current) return
    lastRaw.current = ref
    busyRef.current = true
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const card = await preview({ data: { ref } })
      setScan('')
      if (card.holder?.id === user.id) {
        setFlash({ text: `${card.publicId} sudah di akun ini.`, ok: false })
        return
      }
      if (card.holder) {
        setPending({
          unitId: card.unitId,
          publicId: card.publicId,
          fromName: labelOf(card.holder),
        })
        return
      }
      await assign({ data: { ownerId: user.id, unitId: card.unitId } })
      remember(card.publicId)
    } catch (err) {
      lastRaw.current = ''
      setError(err instanceof Error ? err.message : 'QR tidak dikenali')
    } finally {
      busyRef.current = false
      setBusy(false)
      formRef.current?.querySelector('input')?.focus()
    }
  }

  async function confirmMove() {
    if (!pending) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const moved = pending
      await assign({ data: { ownerId: user.id, unitId: moved.unitId } })
      setPending(null)
      remember(moved.publicId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memindahkan kartu.')
    } finally {
      busyRef.current = false
      setBusy(false)
      formRef.current?.querySelector('input')?.focus()
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void accept(scan, true)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-normal tracking-tight">
          Serahkan ke <em className="text-pine italic">{labelOf(user)}</em>
        </h1>
        <p className="text-muted-foreground">
          Scan QR kartu. Urutan bebas. Tiap scan langsung nempel ke akun ini.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        <button
          className="underline underline-offset-4"
          onClick={() => {
            void navigate({ search: { holder: undefined } })
          }}
          type="button"
        >
          Ganti pembeli
        </button>
        {' · '}
        <Link
          className="underline underline-offset-4"
          params={{ userId: user.id }}
          to="/admin/users/$userId"
        >
          Ke akun
        </Link>
      </p>

      <p className="text-sm tabular-nums">
        {held} kartu di akun ini
        {session.length > 0 ? ` · ${session.length} sesi ini` : ''}
      </p>

      {!active ? (
        <Alert variant="danger">
          Akun ini nonaktif. Aktifkan dulu sebelum menyerahkan kartu.
        </Alert>
      ) : null}
      {flash ? (
        <Alert variant={flash.ok ? 'success' : 'default'}>{flash.text}</Alert>
      ) : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {active && cameraOk ? (
        <QrCamera
          onCode={(raw) => void accept(raw)}
          paused={busy || pending !== null}
        />
      ) : null}

      {active ? (
        <form onSubmit={onSubmit} ref={formRef}>
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
      ) : null}

      {session.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {session.map((publicId) => (
            <li className="font-mono text-sm" key={publicId}>
              {publicId}
            </li>
          ))}
        </ul>
      ) : active ? (
        <p className="text-center text-sm text-muted-foreground">
          Pegang kartu mana saja, lalu scan QR-nya.
        </p>
      ) : null}

      <ConfirmDelete
        confirmLabel="Pindahkan pemegang"
        description={`${pending?.fromName ?? 'Pemegang lama'} tidak lagi memegang ${pending?.publicId ?? 'kartu ini'}. Kartu pindah ke ${labelOf(user)}. Toko dan paket tidak berubah.`}
        onConfirm={() => void confirmMove()}
        onOpenChange={(open) => {
          if (!open && !busyRef.current) {
            lastRaw.current = ''
            setPending(null)
          }
        }}
        open={pending !== null}
        pending={busy}
        title="Pindahkan kartu ke akun ini?"
        variant="default"
      />
    </div>
  )
}
