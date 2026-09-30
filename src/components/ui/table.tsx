import type { ComponentProps } from 'react'
import { cn } from '#/lib/utils'

export function Table({
  className,
  ...props
}: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className={cn('w-full caption-bottom text-left text-sm', className)}
        {...props}
      />
    </div>
  )
}

export function TableHeader({
  className,
  ...props
}: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('bg-accent text-accent-foreground', className)}
      {...props}
    />
  )
}

export function TableBody({
  className,
  ...props
}: ComponentProps<'tbody'>) {
  return (
    <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
}

export function TableFooter({
  className,
  ...props
}: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      className={cn(
        'border-t bg-accent/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

export function TableRow({
  className,
  ...props
}: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-accent/40 data-[state=selected]:bg-accent/60',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({
  className,
  ...props
}: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-10 px-4 py-3 text-xs font-medium tracking-wide whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({
  className,
  ...props
}: ComponentProps<'td'>) {
  return (
    <td
      className={cn('px-4 py-3 align-middle', className)}
      {...props}
    />
  )
}

export function TableCaption({
  className,
  ...props
}: ComponentProps<'caption'>) {
  return (
    <caption
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}
