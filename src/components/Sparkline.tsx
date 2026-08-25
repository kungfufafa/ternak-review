import { cn } from '#/lib/utils'

export function Sparkline({
  data,
  className = 'h-24',
}: {
  data: Array<{ date: string; count: number }>
  className?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className={cn('flex items-end gap-px', className)}>
      {data.map((d) => {
        const active = d.count > 0
        return (
          <div
            key={d.date}
            className={cn(
              'flex-1 rounded-t-[2px]',
              active ? 'bg-foreground/80' : 'bg-muted',
            )}
            style={{
              height: `${Math.max(active ? 8 : 3, (d.count / max) * 100)}%`,
            }}
            title={`${d.date}: ${d.count}`}
          />
        )
      })}
    </div>
  )
}
