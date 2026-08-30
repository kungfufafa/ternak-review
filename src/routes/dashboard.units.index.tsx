import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { PageHeader } from '#/components/page'
import { StatusBadge } from '#/components/ui/badge'
import { Select } from '#/components/ui/input'
import { useDebounced } from '#/hooks/use-debounced'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Button } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '#/components/ui/toggle-group'
import { listStockBatchesFn, listUnitsFn } from '#/server/functions'

type UnitStatus = 'IN_STOCK' | 'ACTIVE' | 'INACTIVE'

export const Route = createFileRoute('/dashboard/units/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    partner?: string
    status?: UnitStatus
    q?: string
    page?: number
    batch?: string
  } => {
    const partner =
      typeof search.partner === 'string' && search.partner.trim()
        ? search.partner.trim()
        : undefined
    const status =
      search.status === 'IN_STOCK' ||
      search.status === 'ACTIVE' ||
      search.status === 'INACTIVE'
        ? search.status
        : undefined
    const q =
      typeof search.q === 'string' && search.q.trim()
        ? search.q.trim()
        : undefined
    const batch =
      typeof search.batch === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.batch)
        ? search.batch
        : undefined
    const pageRaw =
      typeof search.page === 'number' ? search.page : Number(search.page)
    const page =
      Number.isInteger(pageRaw) && pageRaw > 1 ? pageRaw : undefined
    return {
      ...(partner ? { partner } : {}),
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      ...(batch ? { batch } : {}),
      ...(page ? { page } : {}),
    }
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    status: search.status,
    partner: search.partner,
    batch: search.batch,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const [list, batches] = await Promise.all([
      listUnitsFn({
        data: {
          q: deps.q,
          status: deps.status,
          partner: deps.partner,
          batchId: deps.batch,
          page: deps.page ?? 1,
          pageSize: 20,
        },
      }),
      listStockBatchesFn(),
    ])
    return { list, batches }
  },
  component: UnitsListPage,
  head: () => ({
    meta: [{ title: 'Kartu — Ternak Review' }],
  }),
})

function UnitsListPage() {
  const { list, batches } = Route.useLoaderData()
  const { partner, status, q, batch } = Route.useSearch()
  const navigate = useNavigate({ from: '/dashboard/units/' })
  const [draft, setDraft] = useState(q ?? '')
  const debouncedQ = useDebounced(draft, 300)
  const hasFilters = Boolean(q || status || partner || batch)

  useEffect(() => {
    setDraft(q ?? '')
  }, [q])

  useEffect(() => {
    const next = debouncedQ.trim() || undefined
    if (next === q) return
    void navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        q: next,
        page: undefined,
      }),
    })
  }, [debouncedQ, navigate, q])

  return (
    <>
      <PageHeader
        description="Cari, filter, lihat detail, ubah rekanan, atau hapus kartu gudang."
        title="Kartu toko"
      />

      <div className="mb-6 flex flex-col gap-3">
        <InputGroup className="max-w-md">
          <InputGroupInput
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Cari kode, tempat, atau rekanan"
            value={draft}
          />
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <ToggleGroup
          onValueChange={(value) => {
            void navigate({
              replace: true,
              search: (prev) => ({
                ...prev,
                status:
                  value === 'IN_STOCK' ||
                  value === 'ACTIVE' ||
                  value === 'INACTIVE'
                    ? value
                    : undefined,
                page: undefined,
              }),
            })
          }}
          spacing={2}
          type="single"
          value={status ?? 'all'}
          variant="outline"
        >
          <ToggleGroupItem value="all">Semua</ToggleGroupItem>
          <ToggleGroupItem value="IN_STOCK">Gudang</ToggleGroupItem>
          <ToggleGroupItem value="ACTIVE">Di toko</ToggleGroupItem>
          <ToggleGroupItem value="INACTIVE">Dimatikan</ToggleGroupItem>
        </ToggleGroup>
        {batches.length > 0 ? (
          <Select
            aria-label="Cetakan"
            className="max-w-md"
            onChange={(event) => {
              const value = event.target.value
              void navigate({
                replace: true,
                search: (prev) => ({
                  ...prev,
                  batch: value || undefined,
                  page: undefined,
                }),
              })
            }}
            value={batch ?? ''}
          >
            <option value="">Semua cetakan</option>
            {batches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        ) : null}
        {partner ? (
          <p className="text-sm text-muted-foreground">
            Tag <span className="text-foreground">{partner}</span>
            {' · '}
            <Link
              className="hover:underline"
              search={(prev) => ({ ...prev, partner: undefined, page: undefined })}
              to="/dashboard/units"
            >
              Hapus filter
            </Link>
          </p>
        ) : null}
      </div>

      {list.units.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {hasFilters ? 'Tidak ada yang cocok' : 'Belum ada kartu'}
            </EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? 'Ubah kata kunci atau filter.'
                : 'Generate QR dulu di menu Produksi.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link
                  search={{
                    q: undefined,
                    status: undefined,
                    partner: undefined,
                    batch: undefined,
                    page: undefined,
                  }}
                  to="/dashboard/units"
                >
                  Reset pencarian &amp; filter
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link to="/admin/stock">Mulai produksi</Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="grid gap-2 md:hidden">
            {list.units.map((u) => (
              <li key={u.id}>
                <Link
                  className="block rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  params={{ unitId: u.id }}
                  to="/dashboard/units/$unitId"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {u.publicId}
                      </p>
                      <p className="mt-1 truncate font-medium">
                        {u.outletName ?? 'Belum diaktivasi'}
                      </p>
                    </div>
                    <StatusBadge status={u.status} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Cetakan</dt>
                      <dd
                        className="mt-0.5 truncate"
                        title={u.batchLabel ?? undefined}
                      >
                        {u.batchLabel ?? '—'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Rekanan</dt>
                      <dd
                        className="mt-0.5 truncate"
                        title={u.partnerRef ?? undefined}
                      >
                        {u.partnerRef ?? '—'}
                      </dd>
                    </div>
                    <div className="col-span-2 flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Aktivasi</dt>
                      <dd className="tabular-nums">
                        {u.activatedAt
                          ? new Date(u.activatedAt).toLocaleDateString('id-ID')
                          : 'Belum'}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <DataTable>
              <DataTableHead
                columns={[
                  'Kode',
                  'Tempat',
                  'Cetakan',
                  'Rekanan',
                  'Status',
                  'Aktivasi',
                ]}
              />
              <tbody>
                {list.units.map((u) => (
                  <tr key={u.id}>
                    <DataTableCell>
                      <Link
                        className="font-medium hover:underline"
                        params={{ unitId: u.id }}
                        to="/dashboard/units/$unitId"
                      >
                        {u.publicId}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>{u.outletName ?? '—'}</DataTableCell>
                    <DataTableCell muted>{u.batchLabel ?? '—'}</DataTableCell>
                    <DataTableCell muted>{u.partnerRef ?? '—'}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge status={u.status} />
                    </DataTableCell>
                    <DataTableCell muted>
                      {u.activatedAt
                        ? new Date(u.activatedAt).toLocaleDateString('id-ID')
                        : '—'}
                    </DataTableCell>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
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
    </>
  )
}
