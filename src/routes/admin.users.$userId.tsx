import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
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
    meta: [{ title: 'Pengguna — Ternak Review' }],
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
  const unassign = useServerFn(unassignUnitFn)
  const [name, setName] = useState(user.name ?? '')
  const [whatsapp, setWhatsapp] = useState(user.whatsapp ?? '')
  const [publicId, setPublicId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedPin, setRevealedPin] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description={user.email}
        title={user.name ?? user.email}
        action={
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await setStatus({
                  data: {
                    userId: user.id,
                    status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                  },
                })
              })
            }
            type="button"
            variant="outline"
          >
            {user.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        }
      />
      <Link className="text-sm text-muted-foreground hover:text-foreground" to="/admin/users">
        ← Semua pengguna
      </Link>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? <Alert variant="success">Perubahan disimpan.</Alert> : null}
      {revealedPin ? (
        <Alert variant="success">
          PIN baru: <strong>{revealedPin}</strong>. Catat sekarang, tidak
          ditampilkan lagi.
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
              Simpan nama
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PIN &amp; password</CardTitle>
          <CardDescription>
            PIN untuk aktivasi publik. Password untuk dashboard. Reset
            password mencabut sesi yang sedang jalan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await resetPin({ data: { userId: user.id } })
                setRevealedPin(result.pin)
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
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <FieldDescription>Minimal 12 karakter.</FieldDescription>
            </Field>
            <Button disabled={busy || password.length < 12} type="submit">
              Reset password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kartu</CardTitle>
          <CardDescription>
            Assign kartu gudang ke pengguna ini. PIN yang sama berlaku untuk
            semua kartunya.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                await assignCard({
                  data: { ownerId: user.id, publicId: publicId.trim() },
                })
                setPublicId('')
                setSaved(true)
              })
            }}
          >
            <Input
              className="sm:flex-1"
              onChange={(event) => setPublicId(event.target.value.toUpperCase())}
              placeholder="Kode kartu"
              required
              value={publicId}
            />
            <Button disabled={busy || publicId.trim().length < 4} type="submit">
              Assign
            </Button>
          </form>
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
                      onClick={() =>
                        void run(async () => {
                          await unassign({ data: { unitId: card.id } })
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Lepas
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
