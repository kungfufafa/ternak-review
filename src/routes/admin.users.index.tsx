import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SearchIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
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
import { DataTable } from '#/components/ui/data-table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input, Select } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import type { DataTableFeatures } from '#/lib/data-table-features'
import {
  createHolderFn,
  getHolderNotifyStatusFn,
  listHoldersFn,
} from '#/server/functions'

type HolderItem = Awaited<ReturnType<typeof listHoldersFn>>['users'][number]

const holderColumn = createColumnHelper<DataTableFeatures, HolderItem>()

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
  loader: async ({ deps }) => {
    const [list, notify] = await Promise.all([
      listHoldersFn({
        data: { q: deps.q, page: deps.page ?? 1, pageSize: 20 },
      }),
      getHolderNotifyStatusFn(),
    ])
    return { list, notify }
  },
  component: UsersPage,
  head: () => ({
    meta: [{ title: 'Akun pemegang — Ternak Review' }],
  }),
})

function notifyLine(
  label: string,
  result: { status: string; reason?: string },
) {
  if (result.status === 'SENT') return `${label}: terkirim.`
  if (result.status === 'QUEUED') return `${label}: masuk antrean.`
  if (result.status === 'FAILED') {
    return `${label}: gagal${result.reason ? ` — ${result.reason}` : '.'}`
  }
  return `${label}: tidak dikirim${result.reason ? ` — ${result.reason}` : '.'}`
}

function UsersPage() {
  const { list, notify } = Route.useLoaderData()
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
  const [role, setRole] = useState('USER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{
    pin: string
    email: { status: string; reason?: string }
    whatsapp: { status: string; reason?: string }
  } | null>(null)

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
    setCreated(null)
    try {
      const result = await createHolder({
        data: {
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
          name: name.trim() || undefined,
          pin: pin.trim() || undefined,
          role,
        },
      })
      setCreated({
        pin: result.pin,
        email: result.notify.email,
        whatsapp: result.notify.whatsapp,
      })
      setName('')
      setEmail('')
      setPassword('')
      setWhatsapp('')
      setPin('')
      setRole('USER')
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun pemegang.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6">
      <PageHeader
        description="Buat akun pemegang kartu, assign PIN, lalu serahkan kartu. Satu user boleh memegang banyak kartu."
        title="Akun pemegang"
      />

      <Card>
        <CardHeader>
          <CardTitle>Akun pemegang baru</CardTitle>
          <CardDescription>
            PIN dikirim lewat email (Resend/SMTP) dan WhatsApp platform, kalau
            saluran itu aktif di pengaturan. Tamu tidak mengisi nomor ini.
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
              <FieldDescription>
                Untuk OTP masuk dan kirim PIN. Sekarang:{' '}
                {notify.whatsapp ? 'WhatsApp OPEN' : 'WhatsApp belum OPEN'}.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-email">Email (opsional)</FieldLabel>
              <Input
                id="user-email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
              <FieldDescription>
                Untuk kirim PIN. Sekarang:{' '}
                {notify.email ? 'Resend/SMTP aktif' : 'Resend/SMTP belum aktif'}.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-password">Password cadangan</FieldLabel>
              <Input
                id="user-password"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
              <FieldDescription>Opsional. Minimal 6 karakter kalau diisi.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-role">Peran</FieldLabel>
              <Select
                id="user-role"
                onChange={(event) => setRole(event.target.value)}
                value={role}
              >
                {list.roles.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </Select>
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
            {created ? (
              <Alert className="md:col-span-2" variant="success">
                Akun pemegang dibuat. PIN: <strong>{created.pin}</strong>. Catat
                sekarang, tidak ditampilkan lagi. {notifyLine('Email', created.email)}{' '}
                {notifyLine('WhatsApp', created.whatsapp)}
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="mt-5">
            <Button disabled={busy} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Menyimpan…' : 'Buat akun pemegang'}
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
            <EmptyTitle>Belum ada akun pemegang</EmptyTitle>
            <EmptyDescription>
              Buat akun pemegang dulu, lalu hubungkan kartu dari detail akun
              atau detail kartu.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            columns={[
              holderColumn.accessor('name', {
                cell: ({ row }) => (
                  <Link
                    className="font-medium hover:underline"
                    params={{ userId: row.original.id }}
                    to="/admin/users/$userId"
                  >
                    {row.original.name ?? '—'}
                  </Link>
                ),
                header: 'Nama',
              }),
              holderColumn.accessor('whatsapp', {
                cell: ({ row }) => (
                  <span className="text-muted-foreground">
                    {row.original.whatsapp ?? row.original.email}
                  </span>
                ),
                header: 'WhatsApp',
              }),
              holderColumn.accessor('roleName', {
                cell: ({ getValue }) => (
                  <Badge variant="outline">{getValue()}</Badge>
                ),
                header: 'Peran',
              }),
              holderColumn.accessor('cardCount', {
                cell: ({ getValue }) => (
                  <span className="text-muted-foreground">{getValue()}</span>
                ),
                header: 'Kartu',
              }),
              holderColumn.accessor('status', {
                cell: ({ getValue }) => (
                  <Badge variant={getValue() === 'ACTIVE' ? 'secondary' : 'outline'}>
                    {getValue() === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                ),
                header: 'Status',
              }),
            ]}
            data={list.users}
            manualPagination={{ pageCount: list.pageCount }}
            pageSize={list.pageSize}
          />
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
