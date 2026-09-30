import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table'

/**
 * Fitur TanStack Table v9 yang dipakai tabel-tabel admin. Yang tidak
 * didaftarkan di sini akan di-tree-shake dari bundle — tambahkan fitur baru
 * di objek ini, lalu tipe `DataTableFeatures` otomatis mengikutinya.
 *
 * Core row model selalu disertakan; row model fitur opsional dibuat dengan
 * `create*RowModel()` dan didaftarkan di sini (tidak ada lagi opsi
 * `get*RowModel` di tabel).
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

/**
 * Argumen generik pertama untuk `ColumnDef`, `Column`, `Table`, dan `Row`
 * agar tiap tipe tahu API fitur yang tersedia.
 */
export type DataTableFeatures = typeof dataTableFeatures
