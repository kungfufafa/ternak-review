import { cn } from '#/lib/utils'

export function Sparkline({
  data,
  className = 'h-24',
  label = 'Grafik aktivitas harian',
}: {
  data: Array<{ date: string; count: number }>
  className?: string
  label?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const total = data.reduce((sum, item) => sum + item.count, 0)
  return (
    <div
      aria-label={`${label}. Total ${total}.`}
      className={cn('flex items-end gap-px', className)}
      role="img"
    >
      {data.map((d) => {
        const active = d.count > 0
        return (
          <div
            aria-hidden="true"
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
