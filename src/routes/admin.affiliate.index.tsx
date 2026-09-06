import {
  createFileRoute,
  Link,
  stripSearchParams,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { EllipsisVerticalIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { ConfirmDelete } from '#/components/confirm-delete'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { affiliatePlatforms } from '#/components/marketing/affiliate/content'
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
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { formatDay } from '#/lib/utils'
import {
  clearAffiliateWebhookUrlFn,
  deleteAffiliateLeadFn,
  getAffiliateWebhookSettingsFn,
  listAffiliateLeadsFn,
  saveAffiliateWebhookUrlFn,
  testAffiliateWebhookUrlFn,
} from '#/server/functions'
import type { AffiliateWebhookPublicSettings } from '#/server/affiliate-settings'
import { useDebounced } from '#/hooks/use-debounced'
import type { SerializedAffiliateLead } from '#/server/affiliate'

const affiliateSearchSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})

export const Route = createFileRoute('/admin/affiliate/')({
  validateSearch: affiliateSearchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1 })],
  },
  loaderDeps: ({ search }) => ({ q: search.q, page: search.page }),
  loader: async ({ deps }) => {
    const [leads, webhook] = await Promise.all([
      listAffiliateLeadsFn({
        data: { q: deps.q, page: deps.page ?? 1, pageSize: 20 },
      }),
      getAffiliateWebhookSettingsFn(),
    ])
    return { ...leads, webhook }
  },
  component: AffiliateLeadsPage,
  head: () => ({
    meta: [{ title: 'Affiliate — Ternak Review' }],
  }),
})

function platformLabel(key: string) {
  return affiliatePlatforms.find((platform) => platform.key === key)?.value ?? key
}

function AffiliateLeadsPage() {
  const { leads, total, page, pageSize, pageCount, webhook } =
    Route.useLoaderData()
  const { q } = Route.useSearch()
  const navigate = useNavigate({ from: '/admin/affiliate/' })
  const [draft, setDraft] = useState(q ?? '')
  const debouncedQ = useDebounced(draft, 300)

  useEffect(() => {
    setDraft(q ?? '')
  }, [q])

  useEffect(() => {
    const next = debouncedQ.trim() || undefined
    if (next === q) return
    void navigate({
      replace: true,
      search: {
        q: next,
        page: 1,
      },
    })
  }, [debouncedQ, navigate, q])
  const router = useRouter()
  const deleteLead = useServerFn(deleteAffiliateLeadFn)
  const [pending, setPending] = useState<SerializedAffiliateLead | null>(null)
  const [busy, setBusy] = useState(false)

  function goToPage(next: number) {
    void navigate({
      search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Cari, lihat, ubah, atau hapus orang yang daftar dari halaman affiliate."
        title="Pendaftar affiliate"
      />

      <AffiliateWebhookCard settings={webhook} />

      <InputGroup className="max-w-md">
        <InputGroupInput
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Cari nama, email, atau WhatsApp"
          value={draft}
        />
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {leads.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {q ? 'Tidak ada yang cocok' : 'Belum ada pendaftar'}
            </EmptyTitle>
            <EmptyDescription>
              {q
                ? 'Ubah kata kunci pencarian.'
                : 'Form di /affiliate akan muncul di sini begitu ada yang daftar.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable>
            <DataTableHead
              columns={['Nama', 'Kontak', 'Platform', 'Daftar', '']}
            />
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <DataTableCell>
                    <Link
                      className="font-medium hover:underline"
                      params={{ leadId: lead.id }}
                      to="/admin/affiliate/$leadId"
                    >
                      {lead.nama}
                    </Link>
                  </DataTableCell>
                  <DataTableCell muted>
                    <div className="flex flex-col gap-0.5">
                      <span>{lead.whatsapp}</span>
                      <span>{lead.email}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.platforms.map((platform) => (
                        <Badge key={platform} variant="accent">
                          {platformLabel(platform)}
                        </Badge>
                      ))}
                    </div>
                  </DataTableCell>
                  <DataTableCell muted>{formatDay(lead.createdAt)}</DataTableCell>
                  <DataTableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm">
                        <a
                          href={lead.whatsappUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          WhatsApp
                        </a>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Aksi ${lead.nama}`}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <EllipsisVerticalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem asChild>
                              <Link
                                params={{ leadId: lead.id }}
                                to="/admin/affiliate/$leadId"
                              >
                                Lihat / ubah
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={`mailto:${lead.email}`}>Email</a>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => setPending(lead)}
                              variant="destructive"
                            >
                              Hapus
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </DataTableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ListPager
            onPage={goToPage}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
          />
        </div>
      )}

      <ConfirmDelete
        description={
          pending
            ? `${pending.nama} akan dihapus dari daftar. Ini tidak bisa dibatalkan.`
            : ''
        }
        onConfirm={async () => {
          if (!pending) return
          setBusy(true)
          try {
            await deleteLead({ data: { leadId: pending.id } })
            setPending(null)
            await router.invalidate()
          } finally {
            setBusy(false)
          }
        }}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
        open={pending !== null}
        pending={busy}
        title="Hapus pendaftar?"
      />
    </div>
  )
}

function AffiliateWebhookCard({
  settings,
}: {
  settings: AffiliateWebhookPublicSettings
}) {
  const saveFn = useServerFn(saveAffiliateWebhookUrlFn)
  const testFn = useServerFn(testAffiliateWebhookUrlFn)
  const clearFn = useServerFn(clearAffiliateWebhookUrlFn)
  const router = useRouter()
  const [url, setUrl] = useState(settings.url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [tested, setTested] = useState(false)

  useEffect(() => {
    setUrl(settings.url)
  }, [settings.url])

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await saveFn({ data: { url } })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan webhook.')
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await testFn({ data: url.trim() ? { url } : {} })
      await refresh()
      setTested(true)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tes webhook gagal.')
    } finally {
      setBusy(false)
    }
  }

  async function onClear() {
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await clearFn()
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus webhook UI.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook Sheets</CardTitle>
        <CardDescription>
          URL Apps Script / webhook. Lead baru ikut terkirim ke sini. Ganti dari
          halaman ini, tanpa redeploy.
        </CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void onSave(event)}>
        <CardContent className="flex flex-col gap-3">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {tested ? (
            <Alert variant="success">
              Webhook merespons. Cek sheet — ada baris tes yang bisa dihapus.
            </Alert>
          ) : saved ? (
            <Alert variant="success">Webhook disimpan.</Alert>
          ) : null}
          {settings.source === 'env' && !settings.hasUiUrl ? (
            <Alert>
              Masih ada URL lama di secret server. Simpan di sini supaya yang
              dipakai hanya webhook UI.
            </Alert>
          ) : null}
          {!settings.configured ? (
            <Alert>
              Belum ada webhook. Pendaftaran tetap masuk database, tanpa kirim
              ke Sheets.
            </Alert>
          ) : null}
          <Field>
            <FieldLabel htmlFor="affiliate-webhook">URL webhook</FieldLabel>
            <Input
              autoComplete="off"
              id="affiliate-webhook"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              spellCheck={false}
              value={url}
            />
            <FieldDescription>
              HTTPS. Tes kirim menulis satu baris “[TES]” ke tujuan itu.
            </FieldDescription>
          </Field>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button disabled={busy || url.trim().length < 8} type="submit">
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Simpan
          </Button>
          <Button
            disabled={busy || (url.trim().length < 8 && !settings.configured)}
            onClick={() => void onTest()}
            type="button"
            variant="outline"
          >
            Tes kirim
          </Button>
          {settings.hasUiUrl ? (
            <Button
              disabled={busy}
              onClick={() => void onClear()}
              type="button"
              variant="ghost"
            >
              Hapus URL UI
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  )
}
