import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SearchIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { PageHeader } from '#/components/page'
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
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { createHolderFn, listHoldersFn } from '#/server/functions'

export const Route = createFileRoute('/admin/users/')({
  validateSearch: (search: Record<string, unknown>): { q?: string; page?: number } => {
    const q =
      typeof search.q === 'string' && search.q.trim() ? search.q.trim() : undefined
    const pageRaw =
      typeof search.page === 'number' ? search.page : Number(search.page)
    const page = Number.isInteger(pageRaw) && pageRaw > 1 ? pageRaw : undefined
    return { ...(q ? { q } : {}), ...(page ? { page } : {}) }
  },
  loaderDeps: ({ search }) => ({ q: search.q, page: search.page }),
  loader: ({ deps }) =>
    listHoldersFn({
      data: { q: deps.q, page: deps.page ?? 1, pageSize: 20 },
    }),
  component: UsersPage,
  head: () => ({
    meta: [{ title: 'Pengguna — Ternak Review' }],
  }),
})

function UsersPage() {
  const list = Route.useLoaderData()
  const { q } = Route.useSearch()
  const navigate = useNavigate({ from: '/admin/users/' })
  const router = useRouter()
  const createHolder = useServerFn(createHolderFn)
  const [draft, setDraft] = useState(q ?? '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdPin, setCreatedPin] = useState<string | null>(null)

  useEffect(() => {
    setDraft(q ?? '')
  }, [q])

  useEffect(() => {
    const next = draft.trim() || undefined
    if (next === q) return
    const timer = window.setTimeout(() => {
      void navigate({
        replace: true,
        search: { q: next, page: undefined },
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [draft, navigate, q])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setCreatedPin(null)
    try {
      const result = await createHolder({
        data: {
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
          name: name.trim() || undefined,
          pin: pin.trim() || undefined,
        },
      })
      setCreatedPin(result.pin)
      setName('')
      setEmail('')
      setPassword('')
      setWhatsapp('')
      setPin('')
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat pengguna.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="Buat akun pemegang kartu, assign PIN, lalu serahkan kartu. Satu user boleh memegang banyak kartu."
        title="Pengguna"
      />

      <Card>
        <CardHeader>
          <CardTitle>Pengguna baru</CardTitle>
          <CardDescription>
            WhatsApp untuk masuk OTP (kalau gateway aktif). Email + password
            cadangan. PIN 4 digit untuk aktivasi publik.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onCreate}>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="user-name">Nama</FieldLabel>
              <Input
                id="user-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="user-whatsapp">WhatsApp</FieldLabel>
              <Input
                id="user-whatsapp"
                inputMode="tel"
                maxLength={32}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="08xxxxxxxxxx"
                value={whatsapp}
              />
              <FieldDescription>Untuk masuk OTP kalau gateway nyala.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-email">Email (opsional)</FieldLabel>
              <Input
                id="user-email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="user-password">Password cadangan</FieldLabel>
              <Input
                id="user-password"
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
              <FieldDescription>Opsional. Minimal 12 karakter kalau diisi.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-pin">PIN 4 digit (opsional)</FieldLabel>
              <Input
                id="user-pin"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                placeholder="Otomatis jika kosong"
                value={pin}
              />
            </Field>
            {error ? <Alert className="md:col-span-2" variant="danger">{error}</Alert> : null}
            {createdPin ? (
              <Alert className="md:col-span-2" variant="success">
                Pengguna dibuat. PIN pemegang: <strong>{createdPin}</strong>.
                Catat sekarang, tidak ditampilkan lagi.
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="mt-5">
            <Button disabled={busy} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Menyimpan…' : 'Buat pengguna'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <InputGroup className="max-w-md">
        <InputGroupInput
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Cari nama atau email"
          value={draft}
        />
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {list.users.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada pengguna</EmptyTitle>
            <EmptyDescription>
              Buat akun pemegang dulu, lalu assign kartu dari detail pengguna
              atau detail kartu.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable>
            <DataTableHead columns={['Nama', 'WhatsApp', 'Kartu', 'Status']} />
            <tbody>
              {list.users.map((user) => (
                <tr key={user.id}>
                  <DataTableCell>
                    <Link
                      className="font-medium hover:underline"
                      params={{ userId: user.id }}
                      to="/admin/users/$userId"
                    >
                      {user.name ?? '—'}
                    </Link>
                  </DataTableCell>
                  <DataTableCell muted>{user.whatsapp ?? user.email}</DataTableCell>
                  <DataTableCell muted>{user.cardCount}</DataTableCell>
                  <DataTableCell>
                    <Badge variant={user.status === 'ACTIVE' ? 'secondary' : 'outline'}>
                      {user.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </DataTableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ListPager
            onPage={(next) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  page: next > 1 ? next : undefined,
                }),
              })
            }}
            page={list.page}
            pageCount={list.pageCount}
            pageSize={list.pageSize}
            total={list.total}
          />
        </div>
      )}
    </div>
  )
}
