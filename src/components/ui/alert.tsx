import type { HTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export function Alert({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'danger' | 'success'
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-2xl px-4 py-3 text-sm',
        variant === 'danger' &&
          'bg-destructive/10 text-destructive',
        variant === 'success' &&
          'bg-success/10 text-success',
        variant === 'default' && 'bg-muted text-foreground',
        className,
      )}
      {...props}
    />
  )
}
