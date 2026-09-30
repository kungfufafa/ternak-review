import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

export type TableDensity = 'compact' | 'normal'

const headPadding: Record<TableDensity, string> = {
  normal: 'px-4 py-3 text-xs',
  compact: 'px-2 py-1.5 text-[11px]',
}

const cellPadding: Record<TableDensity, string> = {
  normal: 'px-4 py-3',
  compact: 'px-2 py-1.5 text-xs',
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-border">
      <table
        className={cn(
          'min-w-full text-left text-sm',
          '[&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-accent/50',
          '[&_tbody_td]:border-t [&_tbody_td]:border-border',
        )}
      >
        {children}
      </table>
    </div>
  )
}

export function DataTableHead({
  columns,
  density = 'normal',
}: {
  columns: ReactNode[]
  density?: TableDensity
}) {
  return (
    <thead className="bg-accent text-accent-foreground">
      <tr>
        {columns.map((column, index) => (
          <th
            className={cn(
              'font-medium tracking-wide',
              headPadding[density],
              !column && 'text-end',
            )}
            key={index}
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function DataTableCell({
  children,
  muted,
  mono,
  density = 'normal',
}: {
  children: ReactNode
  muted?: boolean
  mono?: boolean
  density?: TableDensity
}) {
  return (
    <td
      className={cn(
        cellPadding[density],
        muted && 'text-muted-foreground',
        mono && 'font-mono text-xs',
      )}
    >
      {children}
    </td>
  )
}
