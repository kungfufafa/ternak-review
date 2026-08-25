import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

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

export function DataTableHead({ columns }: { columns: string[] }) {
  return (
    <thead className="bg-accent text-accent-foreground">
      <tr>
        {columns.map((column, index) => (
          <th
            className={cn(
              'px-4 py-3 text-xs font-medium tracking-wide',
              !column && 'text-end',
            )}
            key={`${column || 'actions'}-${index}`}
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
}: {
  children: ReactNode
  muted?: boolean
  mono?: boolean
}) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        muted && 'text-muted-foreground',
        mono && 'font-mono text-xs',
      )}
    >
      {children}
    </td>
  )
}
