import { Link } from '@tanstack/react-router'
import { batchNextStep } from '#/lib/stock-progress'
import { cn } from '#/lib/utils'

const STEPS = [
  {
    n: 1 as const,
    title: 'Generate QR',
    body: 'Sistem bikin kode tiap kartu',
  },
  {
    n: 2 as const,
    title: 'Cetak',
    body: 'Print kartu dulu, baru tempel tag',
  },
  {
    n: 3 as const,
    title: 'Tempel NFC',
    body: 'Tempel tag, tulis dengan HP',
  },
]

export function nextProductionStep(batch: {
  remaining: number
  encoded: number
  count?: number
}) {
  const remaining =
    typeof batch.remaining === 'number'
      ? batch.remaining
      : (batch.count ?? 0)
  return batchNextStep({ remaining, encoded: batch.encoded })
}

export function ProductionSteps({
  current,
  batchId,
}: {
  current: 1 | 2 | 3
  batchId?: string
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {STEPS.map((step) => {
        const active = step.n === current
        const done = step.n < current
        const className = cn(
          'flex gap-3 rounded-2xl p-4',
          active ? 'bg-accent text-accent-foreground' : 'bg-card',
        )
        const inner = (
          <>
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                active || done
                  ? 'bg-ring text-white'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {step.n}
            </span>
            <span className="min-w-0">
              <span className="block font-medium tracking-tight">
                {step.title}
              </span>
              <span
                className={cn(
                  'mt-0.5 block text-sm',
                  active ? 'text-accent-foreground/80' : 'text-muted-foreground',
                )}
              >
                {step.body}
              </span>
            </span>
          </>
        )

        if (step.n === 1) {
          return (
            <li key={step.n}>
              <Link className={className} to="/admin/stock">
                {inner}
              </Link>
            </li>
          )
        }

        if (step.n === 2 && batchId) {
          return (
            <li key={step.n}>
              <Link
                className={className}
                search={{ batch: batchId }}
                to="/admin/stock/print"
              >
                {inner}
              </Link>
            </li>
          )
        }

        if (step.n === 3 && batchId) {
          return (
            <li key={step.n}>
              <Link
                className={className}
                search={{ batch: batchId }}
                to="/admin/stock/nfc"
              >
                {inner}
              </Link>
            </li>
          )
        }

        return (
          <li className={className} key={step.n}>
            {inner}
          </li>
        )
      })}
    </ol>
  )
}
