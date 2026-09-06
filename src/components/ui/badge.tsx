import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        accent: 'border-transparent bg-accent text-accent-foreground',
        success: 'border-transparent bg-success/15 text-success',
      },
    },
    defaultVariants: { variant: 'outline' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge variant="success">Aktif</Badge>
  if (status === 'INACTIVE') return <Badge variant="muted">Nonaktif</Badge>
  if (status === 'IN_STOCK') return <Badge variant="secondary">Belum aktif</Badge>
  return <Badge variant="outline">Status tidak dikenal</Badge>
}
