import { StarIcon } from 'lucide-react'
import {
  closingBand,
  closingHint,
  formatPlaceRating,
  type PlaceRatingSnapshot,
  type ProspectConfidence,
  type ProspectFit,
  type ProspectVerdict,
} from '#/lib/place-rating'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'

export function PlaceRatingLine({
  rating,
  userRatingCount,
  className,
  showHint,
  showBand = false,
}: PlaceRatingSnapshot & {
  className?: string
  showHint?: boolean
  showBand?: boolean
}) {
  const snapshot = { rating, userRatingCount }
  const band = closingBand(snapshot)
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <StarIcon
          aria-hidden="true"
          className={
            rating == null
              ? 'size-3.5 text-muted-foreground'
              : 'size-3.5 fill-current text-pine'
          }
        />
        <span className="tabular-nums">{formatPlaceRating(snapshot)}</span>
        {showBand && band === 'hot' ? (
          <Badge variant="accent">Mudah closing</Badge>
        ) : null}
        {showBand && band === 'warm' ? (
          <Badge variant="secondary">Bisa naik cepat</Badge>
        ) : null}
      </p>
      {showHint ? (
        <p className="text-xs text-muted-foreground">{closingHint(snapshot)}</p>
      ) : null}
    </div>
  )
}

const VERDICT_VARIANT: Record<
  ProspectVerdict,
  'success' | 'accent' | 'secondary' | 'muted'
> = {
  deal: 'success',
  save: 'accent',
  check: 'secondary',
  skip: 'muted',
}

const CONFIDENCE_VARIANT: Record<ProspectConfidence, 'outline' | 'muted'> = {
  high: 'outline',
  mid: 'outline',
  low: 'muted',
}

export function ProspectFitMarks({
  fit,
  className,
}: {
  fit: ProspectFit
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={VERDICT_VARIANT[fit.verdict]}>{fit.label}</Badge>
        <Badge variant={CONFIDENCE_VARIANT[fit.confidence]}>{fit.confidenceLabel}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{fit.evidence.join(' · ')}</p>
      <p className="text-xs text-muted-foreground">{fit.reason}</p>
    </div>
  )
}
