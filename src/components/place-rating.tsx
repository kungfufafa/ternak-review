import { StarIcon } from 'lucide-react'
import {
  closingBand,
  closingHint,
  formatPlaceRating,
  type PlaceRatingSnapshot,
} from '#/lib/place-rating'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'

export function PlaceRatingLine({
  rating,
  userRatingCount,
  className,
  showHint,
}: PlaceRatingSnapshot & {
  className?: string
  showHint?: boolean
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
        {band === 'hot' ? <Badge variant="accent">Mudah closing</Badge> : null}
        {band === 'warm' ? <Badge variant="secondary">Bisa naik cepat</Badge> : null}
      </p>
      {showHint ? (
        <p className="text-xs text-muted-foreground">{closingHint(snapshot)}</p>
      ) : null}
    </div>
  )
}
