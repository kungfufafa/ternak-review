import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SearchIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { PageHeader } from '#/components/page'
import { ViewCustomize, type ViewColumnDef } from '#/components/view-customize'
import { StatusBadge } from '#/components/ui/badge'
import { Alert } from '#/components/ui/alert'
import { Select } from '#/components/ui/input'
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
import type { ViewPrefs } from '#/lib/view-prefs'
import { getViewPrefsFn, listStockBatchesFn, listUnitsFn, resetUnitFn } from '#/server/functions'

type UnitStatus = 'IN_STOCK' | 'ACTIVE' | 'INACTIVE'

export const Route = createFileRoute('/dashboard/units/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    partner?: string
    status?: UnitStatus
    ownership?: 'unassigned' | 'assigned'
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
    const ownership =
      search.ownership === 'unassigned' || search.ownership === 'assigned'
        ? search.ownership
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
      ...(ownership ? { ownership } : {}),
      ...(q ? { q } : {}),
      ...(batch ? { batch } : {}),
      ...(page ? { page } : {}),
    }
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    status: search.status,
    ownership: search.ownership,
    partner: search.partner,
    batch: search.batch,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const [list, batches, prefs] = await Promise.all([
      listUnitsFn({
        data: {
          q: deps.q,
          status: deps.status,
          ownership: deps.ownership,
          partner: deps.partner,
          batchId: deps.batch,
          page: deps.page ?? 1,
          pageSize: 20,
        },
      }),
      listStockBatchesFn(),
      getViewPrefsFn({ data: { view: 'units' } }),
    ])
    return { list, batches, prefs }
  },
  component: UnitsListPage,
  head: () => ({
    meta: [{ title: 'Kartu — Ternak Review' }],
  }),
})

const UNITS_COLUMNS: ViewColumnDef[] = [
  { key: 'code', label: 'Kode' },
  { key: 'outlet', label: 'Tempat' },
  { key: 'batch', label: 'Cetakan' },
  { key: 'partner', label: 'Rekanan' },
  { key: 'holder', label: 'Pemegang' },
  { key: 'nfc', label: 'NFC' },
  { key: 'status', label: 'Status' },
  { key: 'activatedAt', label: 'Aktivasi' },
]

function UnitsListPage() {
  const { list, batches, prefs: savedPrefs } = Route.useLoaderData()
  const { partner, status, ownership, q, batch } = Route.useSearch()
  const navigate = useNavigate({ from: '/dashboard/units/' })
  const router = useRouter()
  const resetUnit = useServerFn(resetUnitFn)
  const [prefs, setPrefs] = useState<Required<ViewPrefs>>(savedPrefs)
  const [draft, setDraft] = useState(q ?? '')
  const [resetTarget, setResetTarget] = useState<{
    id: string
    publicId: string
  } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const hasFilters = Boolean(q || status || ownership || partner || batch)

  useEffect(() => {
    setDraft(q ?? '')
  }, [q])

  useEffect(() => {
    const next = draft.trim() || undefined
    if (next === q) return
    const timer = window.setTimeout(() => {
      void navigate({
        replace: true,
        search: (prev) => ({
          ...prev,
          q: next,
          page: undefined,
        }),
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [draft, navigate, q])

  const visibleColumns = UNITS_COLUMNS.filter((column) =>
    prefs.columns.includes(column.key),
  )
  // Kode & status selalu tampil di header kartu mobile sebagai identitas,
  // jadi keduanya tidak diulang di grid detail.
  const mobileColumns = visibleColumns.filter(
    (column) => column.key !== 'code' && column.key !== 'status',
  )

  function unitCell(unit: (typeof list.units)[number], key: string): {
    content: ReactNode
    muted?: boolean
  } {
    switch (key) {
      case 'code':
        return {
          content: (
            <Link
              className="font-medium hover:underline"
              params={{ unitId: unit.id }}
              to="/dashboard/units/$unitId"
            >
              {unit.publicId}
            </Link>
          ),
        }
      case 'outlet':
        return { content: unit.outletName ?? '—' }
      case 'batch':
        return { content: unit.batchLabel ?? '—', muted: true }
      case 'partner':
        return { content: unit.partnerRef ?? '—', muted: true }
      case 'holder':
        return {
          content: unit.holderId ? (
            <Link
              className="hover:underline"
              params={{ userId: unit.holderId }}
              to="/admin/users/$userId"
            >
              {unit.holderName ?? unit.holderEmail ?? 'Akun pemegang'}
            </Link>
          ) : (
            'Belum dialokasikan'
          ),
        }
      case 'nfc':
        return {
          content: unit.nfcEncodedAt ? 'Sudah ditulis' : 'Belum ditulis',
          muted: true,
        }
      case 'status':
        return { content: <StatusBadge status={unit.status} /> }
      case 'activatedAt':
        return {
          content: unit.activatedAt
            ? new Date(unit.activatedAt).toLocaleDateString('id-ID')
            : '—',
          muted: true,
        }
      default:
        return { content: null }
    }
  }

  function resetButton(unit: (typeof list.units)[number], compact = false) {
    if (!unit.canReset) return null
    return (
      <Button
        onClick={() => {
          setResetError(null)
          setResetTarget({ id: unit.id, publicId: unit.publicId })
        }}
        size="sm"
        type="button"
        variant={compact ? 'outline' : 'outline'}
      >
        {compact ? 'Reset ke gudang' : 'Reset'}
      </Button>
    )
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl">
      <PageHeader
        action={
          <ViewCustomize
            columns={UNITS_COLUMNS}
            onChange={setPrefs}
            prefs={prefs}
            view="units"
          />
        }
        description="Pantau NFC, tentukan pemegang, dan ikuti aktivasi setiap kartu. Reset mengembalikan kartu ke gudang supaya bisa dipasang ke toko baru dengan kode QR yang sama."
        title="Semua kartu"
      />

      <div className="mb-6 flex flex-col gap-3">
        <InputGroup className="max-w-md">
          <InputGroupInput
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Cari kode, toko, pemegang, atau rekanan"
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
          <ToggleGroupItem value="IN_STOCK">Belum aktif</ToggleGroupItem>
          <ToggleGroupItem value="ACTIVE">Aktif</ToggleGroupItem>
          <ToggleGroupItem value="INACTIVE">Nonaktif</ToggleGroupItem>
        </ToggleGroup>
        <Select
          aria-label="Pemegang kartu"
          className="max-w-md"
          onChange={(event) => {
            const value = event.target.value
            void navigate({
              replace: true,
              search: (prev) => ({
                ...prev,
                ownership:
                  value === 'unassigned' || value === 'assigned'
                    ? value
                    : undefined,
                page: undefined,
              }),
            })
          }}
          value={ownership ?? ''}
        >
          <option value="">Semua pemegang</option>
          <option value="unassigned">Belum dialokasikan</option>
          <option value="assigned">Sudah ada pemegang</option>
        </Select>
        {status === 'IN_STOCK' ? (
          <p className="text-sm text-muted-foreground">
            {ownership === 'assigned'
              ? 'Menunggu pemegang atau admin mengaktifkan toko.'
              : ownership === 'unassigned'
                ? 'Belum ada pemegang. Buka detail untuk menetapkan akun, atau aktifkan tokonya dulu.'
                : 'Termasuk kartu tanpa pemegang dan yang sudah dialokasikan, belum dipasang ke toko.'}
          </p>
        ) : null}
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
        {resetError ? <Alert variant="danger">{resetError}</Alert> : null}
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
                : 'Buat kartu dulu di menu Produksi kartu.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link
                  onClick={() => setDraft('')}
                  search={{
                    q: undefined,
                    status: undefined,
                    ownership: undefined,
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
            {list.units.map((unit) => (
              <li
                className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
                key={unit.id}
              >
                <Link
                  className="block p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  params={{ unitId: unit.id }}
                  to="/dashboard/units/$unitId"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {unit.publicId}
                      </p>
                      <p className="mt-1 truncate font-medium">
                        {unit.outletName ?? 'Belum diaktivasi'}
                      </p>
                    </div>
                    <StatusBadge status={unit.status} />
                  </div>

                  {mobileColumns.length > 0 ? (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                      {mobileColumns.map((column) => {
                        const cell = unitCell(unit, column.key)
                        return (
                          <div className="min-w-0" key={column.key}>
                            <dt className="text-muted-foreground">
                              {column.label}
                            </dt>
                            <dd
                              className="mt-0.5 truncate"
                              title={
                                typeof cell.content === 'string'
                                  ? cell.content
                                  : undefined
                              }
                            >
                              {cell.content}
                            </dd>
                          </div>
                        )
                      })}
                    </dl>
                  ) : null}
                </Link>
                {unit.canReset ? (
                  <div className="border-t border-border px-4 py-3">
                    {resetButton(unit, true)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <DataTable>
              <DataTableHead
                columns={[...visibleColumns.map((column) => column.label), '']}
                density={prefs.density}
              />
              <tbody>
                {list.units.map((unit) => (
                  <tr key={unit.id}>
                    {visibleColumns.map((column) => {
                      const cell = unitCell(unit, column.key)
                      return (
                        <DataTableCell
                          density={prefs.density}
                          key={column.key}
                          muted={cell.muted}
                        >
                          {cell.content}
                        </DataTableCell>
                      )
                    })}
                    <DataTableCell density={prefs.density}>
                      {resetButton(unit)}
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

      <ConfirmDelete
        confirmLabel="Reset ke gudang"
        description={`${resetTarget?.publicId ?? 'Kartu'} kembali belum aktif, lepas dari toko dan pemegang. Kode QR/NFC tetap sama, bisa diaktifkan ke toko baru. Riwayat scan dan masukan dihapus.`}
        onConfirm={async () => {
          if (!resetTarget) return
          setResetting(true)
          setResetError(null)
          try {
            const result = await resetUnit({ data: { unitId: resetTarget.id } })
            if (!result.ok) {
              setResetError(result.error)
              setResetTarget(null)
              return
            }
            setResetTarget(null)
            await router.invalidate({ sync: true })
          } catch (err) {
            setResetError(
              err instanceof Error ? err.message : 'Gagal mereset kartu.',
            )
            setResetTarget(null)
          } finally {
            setResetting(false)
          }
        }}
        onOpenChange={(open) => {
          if (!resetting && !open) setResetTarget(null)
        }}
        open={Boolean(resetTarget)}
        pending={resetting}
        title="Reset kartu ke gudang?"
      />
    </div>
  )
}
