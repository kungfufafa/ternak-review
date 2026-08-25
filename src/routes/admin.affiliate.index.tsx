import {
  createFileRoute,
  Link,
  stripSearchParams,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { EllipsisVerticalIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { ConfirmDelete } from '#/components/confirm-delete'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { affiliatePlatforms } from '#/components/marketing/affiliate/content'
import { PageHeader } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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
  deleteAffiliateLeadFn,
  listAffiliateLeadsFn,
} from '#/server/functions'
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
    return listAffiliateLeadsFn({
      data: { q: deps.q, page: deps.page ?? 1, pageSize: 20 },
    })
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
  const { leads, total, page, pageSize, pageCount } = Route.useLoaderData()
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
