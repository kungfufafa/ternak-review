import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useTable,
  type ColumnDef,
  type PaginationState,
  type ReactTable,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  dataTableFeatures,
  type DataTableFeatures,
} from '#/lib/data-table-features'
import { cn } from '#/lib/utils'

const compactDensity =
  '[&_th]:px-2 [&_th]:py-1.5 [&_th]:text-[11px] [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-xs'

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData, any>[]
  data: TData[]
  /** Baris per halaman untuk paginasi klien (default 10). */
  pageSize?: number
  /** Urutan awal, misal `[{ id: 'email', desc: true }]`. */
  initialSorting?: SortingState
  /**
   * Paginasi diatur di luar tabel (server-side lewat URL + ListPager).
   * Pager internal disembunyikan dan halaman mengikuti `pageCount` ini.
   */
  manualPagination?: { pageCount: number }
  /** 'compact' mempersempit padding sel untuk tabel padat. */
  density?: 'normal' | 'compact'
  /** Kelas tambahan per baris (mis. sorot batch terakhir). */
  rowClassName?: (row: TData) => string | undefined
  className?: string
}

/**
 * Tabel data TanStack Table v9 — sorting & paginasi menyala lewat
 * `dataTableFeatures`. Kolom yang bisa diurut ditentukan di definisi kolom
 * (tombol header memanggil `column.toggleSorting()`).
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  pageSize = 10,
  initialSorting = [],
  manualPagination,
  density = 'normal',
  rowClassName,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    onSortingChange: setSorting,
    onPaginationChange: manualPagination ? undefined : setPagination,
    manualPagination: manualPagination ? true : undefined,
    pageCount: manualPagination?.pageCount,
    state: {
      sorting,
      // Mode manual: halaman datang dari server, jadi state paginasi
      // dikunci di halaman 0 dengan pageSize = ukuran halaman server agar
      // semua baris yang dimuat ikut ter-render.
      pagination: manualPagination ? { pageIndex: 0, pageSize } : pagination,
    },
  })

  const rows = table.getRowModel().rows
  const columnCount = table.getAllLeafColumns().length

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-card ring-1 ring-border',
        className,
      )}
    >
      <Table className={density === 'compact' ? compactDensity : undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow
                className={rowClassName?.(row.original)}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                key={row.id}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={columnCount}
              >
                Tidak ada data.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {manualPagination ? null : <DataTablePagination table={table} />}
    </div>
  )
}

export function DataTablePagination<TData extends RowData>({
  table,
  className,
}: {
  // Tipe features harus konkret — API fitur (previousPage, dll.) hanya
  // muncul di `Table<TFeatures>` saat TFeatures bukan generic terbuka.
  table: ReactTable<DataTableFeatures, TData>
  className?: string
}) {
  const totalRows = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.state.pagination
  const firstRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const lastRow = Math.min(firstRow + pageSize - 1, totalRows)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border px-4 py-3',
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        {totalRows > 0
          ? `${firstRow}–${lastRow} dari ${totalRows} baris`
          : '0 baris'}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Halaman {pageIndex + 1} dari {Math.max(table.getPageCount(), 1)}
        </span>
        <Button
          aria-label="Halaman sebelumnya"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <Button
          aria-label="Halaman berikutnya"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  )
}
