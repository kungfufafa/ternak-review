import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page'
import { StatusBadge } from '#/components/ui/badge'
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
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  assignUnitToHolderFn,
  getHolderFn,
  getUnitDetailFn,
  listUnitsFn,
  resetHolderPasswordFn,
  resetHolderPinFn,
  setHolderStatusFn,
  unassignUnitFn,
  updateHolderProfileFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/users/$userId')({
  loader: async ({ params }) => {
    const user = await getHolderFn({ data: { userId: params.userId } })
    if (!user) throw notFound()
    return { user }
  },
  component: UserDetailPage,
  head: () => ({
    meta: [{ title: 'Akun pemegang — Ternak Review' }],
  }),
})

function UserDetailPage() {
  const { user } = Route.useLoaderData()
  const router = useRouter()
  const updateProfile = useServerFn(updateHolderProfileFn)
  const setStatus = useServerFn(setHolderStatusFn)
  const resetPin = useServerFn(resetHolderPinFn)
  const resetPassword = useServerFn(resetHolderPasswordFn)
  const assignCard = useServerFn(assignUnitToHolderFn)
  const findCards = useServerFn(listUnitsFn)
  const getCardDetail = useServerFn(getUnitDetailFn)
  const unassign = useServerFn(unassignUnitFn)
  const [name, setName] = useState(user.name ?? '')
  const [whatsapp, setWhatsapp] = useState(user.whatsapp ?? '')
  const [publicId, setPublicId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedPin, setRevealedPin] = useState<{
    pin: string
    email: { status: string; reason?: string }
    whatsapp: { status: string; reason?: string }
  } | null>(null)
  const [saved, setSaved] = useState(false)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [pendingTransfer, setPendingTransfer] = useState<
    NonNullable<Awaited<ReturnType<typeof getUnitDetailFn>>> | null
  >(null)
  const [pendingRemoval, setPendingRemoval] = useState<
    (typeof user.cards)[number] | null
  >(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
      setStatusConfirmOpen(false)
      setPendingTransfer(null)
      setPendingRemoval(null)
    } finally {
      setBusy(false)
    }
  }

  async function prepareAssignment() {
    const code = publicId.trim().toUpperCase()
    await run(async () => {
      for (let page = 1; ; page += 1) {
        const result = await findCards({ data: { q: code, page, pageSize: 100 } })
        const card = result.units.find((item) => item.publicId === code)
        if (card) {
          const detail = await getCardDetail({ data: { unitId: card.id } })
          if (!detail) throw new Error('Kartu tidak ditemukan.')
          if (detail.holder && detail.holder.id !== user.id) {
            setPendingTransfer(detail)
            return
          }
          if (detail.holder?.id === user.id) {
            throw new Error(`${code} sudah terhubung ke akun ini.`)
          }
          await assignCard({ data: { ownerId: user.id, unitId: detail.id } })
          setPublicId('')
          setSaved(true)
          return
        }
        if (page >= result.pageCount) throw new Error('Kartu tidak ditemukan.')
      }
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description={user.email}
        title={user.name ?? user.email}
        action={
          <Button
            disabled={busy}
            onClick={() => setStatusConfirmOpen(true)}
            type="button"
            variant="outline"
          >
            {user.status === 'ACTIVE' ? 'Nonaktifkan akun' : 'Aktifkan akun'}
          </Button>
        }
      />
      <Link className="text-sm text-muted-foreground hover:text-foreground" to="/admin/users">
        ← Semua akun pemegang
      </Link>
      <p className="text-sm text-muted-foreground">
        Akun {user.status === 'ACTIVE' ? 'aktif' : 'nonaktif'}. Menonaktifkan akun
        menghentikan akses masuk dan aktivasi dengan PIN. Kartu yang sudah aktif
        tetap melayani tamu; nonaktifkan kartu dari detailnya bila diperlukan.
      </p>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? <Alert variant="success">Perubahan disimpan.</Alert> : null}
      {revealedPin ? (
        <Alert variant="success">
          PIN baru: <strong>{revealedPin.pin}</strong>. Catat sekarang, tidak
          ditampilkan lagi.{' '}
          {revealedPin.email.status === 'SENT'
            ? 'Email: terkirim.'
            : revealedPin.email.status === 'FAILED'
              ? `Email: gagal${revealedPin.email.reason ? ` — ${revealedPin.email.reason}` : '.'}`
              : `Email: tidak dikirim${revealedPin.email.reason ? ` — ${revealedPin.email.reason}` : '.'}`}{' '}
          {revealedPin.whatsapp.status === 'QUEUED'
            ? 'WhatsApp: masuk antrean.'
            : revealedPin.whatsapp.status === 'FAILED'
              ? `WhatsApp: gagal${revealedPin.whatsapp.reason ? ` — ${revealedPin.whatsapp.reason}` : '.'}`
              : `WhatsApp: tidak dikirim${revealedPin.whatsapp.reason ? ` — ${revealedPin.whatsapp.reason}` : '.'}`}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void run(async () => {
              await updateProfile({
                data: { userId: user.id, name, whatsapp },
              })
              setSaved(true)
            })
          }}
        >
          <CardContent>
            <Field>
              <FieldLabel htmlFor="holder-name">Nama</FieldLabel>
              <Input
                id="holder-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            <Field className="mt-4">
              <FieldLabel htmlFor="holder-whatsapp">WhatsApp</FieldLabel>
              <Input
                id="holder-whatsapp"
                inputMode="tel"
                maxLength={32}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="08xxxxxxxxxx"
                value={whatsapp}
              />
              <FieldDescription>
                Nomor ini dipakai untuk masuk OTP.
              </FieldDescription>
            </Field>
          </CardContent>
          <CardFooter className="mt-5">
            <Button disabled={busy} type="submit">
              Simpan profil
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PIN &amp; password</CardTitle>
          <CardDescription>
            PIN untuk aktivasi. Reset PIN dikirim lewat email dan WhatsApp
            yang sama dengan pengaturan kirim. Password untuk dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await resetPin({ data: { userId: user.id } })
                setRevealedPin({
                  pin: result.pin,
                  email: result.notify.email,
                  whatsapp: result.notify.whatsapp,
                })
              })
            }
            type="button"
            variant="outline"
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Generate PIN baru
          </Button>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                await resetPassword({ data: { userId: user.id, password } })
                setPassword('')
                setSaved(true)
              })
            }}
          >
            <Field>
              <FieldLabel htmlFor="holder-password">Password baru</FieldLabel>
              <Input
                id="holder-password"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <FieldDescription>Minimal 6 karakter.</FieldDescription>
            </Field>
            <Button disabled={busy || password.length < 6} type="submit">
              Reset password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kartu</CardTitle>
          <CardDescription>
            Tempel kode kartu untuk menghubungkan ke akun ini. PIN akun dipakai
            saat aktivasi publik.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              void prepareAssignment()
            }}
          >
            <Input
              className="sm:flex-1"
              aria-label="Kode kartu yang akan dihubungkan"
              disabled={busy || user.status !== 'ACTIVE'}
              maxLength={32}
              onChange={(event) => setPublicId(event.target.value.toUpperCase())}
              placeholder="Kode kartu"
              required
              value={publicId}
            />
            <Button
              disabled={busy || publicId.trim().length < 4 || user.status !== 'ACTIVE'}
              type="submit"
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Hubungkan kartu
            </Button>
          </form>
          {user.status !== 'ACTIVE' ? (
            <p className="text-sm text-muted-foreground">
              Aktifkan akun terlebih dahulu untuk menghubungkan kartu.
            </p>
          ) : null}
          {user.cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kartu.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {user.cards.map((card) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  key={card.id}
                >
                  <div className="min-w-0">
                    <Link
                      className="font-mono text-sm hover:underline"
                      params={{ unitId: card.id }}
                      to="/dashboard/units/$unitId"
                    >
                      {card.publicId}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {card.outletName ?? 'Belum diaktivasi'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={card.status} />
                    <Button
                      disabled={busy}
                      onClick={() => setPendingRemoval(card)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Lepas pemegang
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDelete
        confirmLabel={user.status === 'ACTIVE' ? 'Nonaktifkan akun' : 'Aktifkan akun'}
        description={
          user.status === 'ACTIVE'
            ? `${user.name ?? user.email} tidak bisa masuk atau aktivasi dengan PIN. Kartu aktif tetap melayani tamu.`
            : `${user.name ?? user.email} bisa masuk dan memakai PIN lagi. Status kartu tidak berubah.`
        }
        onConfirm={() =>
          run(async () => {
            await setStatus({
              data: {
                userId: user.id,
                status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
              },
            })
            setStatusConfirmOpen(false)
            setSaved(true)
          })
        }
        onOpenChange={(open) => {
          if (!busy) setStatusConfirmOpen(open)
        }}
        open={statusConfirmOpen}
        pending={busy}
        title={user.status === 'ACTIVE' ? 'Nonaktifkan akun pemegang?' : 'Aktifkan akun pemegang?'}
        variant={user.status === 'ACTIVE' ? 'destructive' : 'default'}
      />

      <ConfirmDelete
        confirmLabel="Pindahkan pemegang"
        description={`${pendingTransfer?.holder?.name ?? pendingTransfer?.holder?.email ?? 'Pemegang lama'} tidak lagi bisa kelola ${pendingTransfer?.publicId ?? 'kartu ini'}. Akses pindah ke ${user.name ?? user.email}. Toko dan paket tidak berubah.`}
        onConfirm={() =>
          run(async () => {
            if (!pendingTransfer) return
            await assignCard({ data: { ownerId: user.id, unitId: pendingTransfer.id } })
            setPendingTransfer(null)
            setPublicId('')
            setSaved(true)
          })
        }
        onOpenChange={(open) => {
          if (!open && !busy) setPendingTransfer(null)
        }}
        open={pendingTransfer !== null}
        pending={busy}
        title="Pindahkan kartu ke akun ini?"
        variant="default"
      />

      <ConfirmDelete
        confirmLabel="Lepas pemegang"
        description={`${pendingRemoval?.publicId ?? 'Kartu ini'} menjadi tanpa pemegang. ${user.name ?? user.email} tidak lagi bisa kelolanya dari aplikasi. Tamu tetap bisa review jika kartu aktif.`}
        onConfirm={() =>
          run(async () => {
            if (!pendingRemoval) return
            await unassign({ data: { unitId: pendingRemoval.id } })
            setPendingRemoval(null)
            setSaved(true)
          })
        }
        onOpenChange={(open) => {
          if (!open && !busy) setPendingRemoval(null)
        }}
        open={pendingRemoval !== null}
        pending={busy}
        title="Lepas kartu dari akun ini?"
      />
    </div>
  )
}
