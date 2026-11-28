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
import { createColumnHelper } from '@tanstack/react-table'
import { z } from 'zod'
import { ConfirmDelete } from '#/components/confirm-delete'
import { ListPager } from '#/components/list-pager'
import { affiliatePlatforms } from '#/components/marketing/affiliate/content'
import { PageHeader } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { DataTable } from '#/components/ui/data-table'
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
import type { DataTableFeatures } from '#/lib/data-table-features'
import {
  deleteAffiliateLeadFn,
  listAffiliateLeadsFn,
} from '#/server/functions'
import { useDebounced } from '#/hooks/use-debounced'
import type { SerializedAffiliateLead } from '#/server/affiliate'

import { AFFILIATE_STATUSES, affiliateStatusLabels } from '#/types/marketing'

const leadColumn = createColumnHelper<
  DataTableFeatures,
  SerializedAffiliateLead
>()

const affiliateSearchSchema = z.object({
  review: z.enum(AFFILIATE_STATUSES).optional().catch(undefined),
  q: z.string().trim().min(1).max(200).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})

export const Route = createFileRoute('/admin/affiliate/')({
  validateSearch: affiliateSearchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1 })],
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    status: search.review,
    page: search.page,
  }),
  loader: ({ deps }) =>
    listAffiliateLeadsFn({ data: { ...deps, page: deps.page ?? 1, pageSize: 20 } }),
  component: AffiliateLeadsPage,
  head: () => ({
    meta: [{ title: 'Affiliate — Ternak Review' }],
  }),
})

function platformLabel(key: string) {
  return (
    affiliatePlatforms.find((platform) => platform.key === key)?.value ?? key
  )
}

function AffiliateLeadsPage() {
  const { leads, total, page, pageSize, pageCount } =
    Route.useLoaderData()
  const { owner } = Route.useRouteContext()
  const canManage = owner.permissions.includes('affiliate.manage')
  const { q, review: status } = Route.useSearch()
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
      search: (prev) => ({ ...prev, q: next, page: 1 }),
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
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-8">
      <PageHeader
        description="Tinjau profil pendaftar dan tindak lanjuti mitra yang diterima."
        title="Pendaftar affiliate"
      />

      <nav
        aria-label="Filter status pendaftaran"
        className="flex flex-wrap gap-2"
      >
        {([undefined, ...AFFILIATE_STATUSES] as const).map((value) => (
          <Button
            key={value ?? 'all'}
            asChild
            size="sm"
            variant={status === value ? 'default' : 'outline'}
          >
            <Link
              to="/admin/affiliate"
              search={(prev) => ({ ...prev, review: value, page: 1 })}
              aria-current={status === value ? 'page' : undefined}
            >
              {value ? affiliateStatusLabels[value] : 'Semua'}
            </Link>
          </Button>
        ))}
      </nav>

      <InputGroup className="max-w-md">
        <InputGroupInput
          onChange={(event) => setDraft(event.target.value)}
          maxLength={200}
          aria-label="Cari pendaftar"
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
              {q || status ? 'Tidak ada yang cocok' : 'Belum ada pendaftar'}
            </EmptyTitle>
            <EmptyDescription>
              {q || status
                ? 'Coba status lain atau ubah kata kunci pencarian.'
                : 'Form di /affiliate akan muncul di sini begitu ada yang daftar.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            columns={[
              leadColumn.accessor('nama', {
                cell: ({ row }) => (
                  <Link
                    className="font-medium hover:underline"
                    params={{ leadId: row.original.id }}
                    to="/admin/affiliate/$leadId"
                  >
                    {row.original.nama}
                  </Link>
                ),
                header: 'Nama',
              }),
              leadColumn.display({
                cell: ({ row }) => (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">
                      {row.original.whatsapp}
                    </span>
                    <span className="text-muted-foreground">
                      {row.original.email}
                    </span>
                  </div>
                ),
                header: 'Kontak',
                id: 'kontak',
              }),
              leadColumn.accessor('platforms', {
                cell: ({ row }) => (
                  <div className="flex flex-wrap gap-1.5">
                    {row.original.platforms.map((platform) => (
                      <Badge key={platform} variant="accent">
                        {platformLabel(platform)}
                      </Badge>
                    ))}
                  </div>
                ),
                header: 'Platform',
              }),
              leadColumn.accessor('status', {
                header: 'Status',
                cell: ({ row }) => (
                  <Badge variant="outline">
                    {affiliateStatusLabels[row.original.status]}
                  </Badge>
                ),
              }),
              leadColumn.accessor('createdAt', {
                cell: ({ getValue }) => (
                  <span className="text-muted-foreground">
                    {formatDay(getValue())}
                  </span>
                ),
                header: 'Daftar',
              }),
              leadColumn.display({
                cell: ({ row }) => {
                  const lead = row.original
                  return (
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
                                Lihat detail
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={`mailto:${lead.email}`}>Email</a>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          {canManage && <DropdownMenuSeparator />}
                          <DropdownMenuGroup>
                            {canManage && (
                              <DropdownMenuItem
                                onClick={() => setPending(lead)}
                                variant="destructive"
                              >
                                Hapus
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                },
                header: () => <span className="sr-only">Aksi</span>,
                id: 'aksi',
              }),
            ]}
            data={leads}
            manualPagination={{ pageCount }}
            pageSize={pageSize}
          />
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
