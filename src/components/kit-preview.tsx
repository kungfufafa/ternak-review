import { useEffect, useState } from 'react'
import { ReviewCard } from '#/components/review-card'
import type { CardDesign } from '#/lib/card-design'
import { cardQrSvg } from '#/lib/qr'

export function KitPreview({ design }: { design?: CardDesign }) {
  const [qrSvg, setQrSvg] = useState('')

  useEffect(() => {
    let cancelled = false
    void cardQrSvg(`${window.location.origin}/r/PREVIEW`).then((svg) => {
      if (!cancelled) setQrSvg(svg)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="review-card-scale">
        <ReviewCard design={design} qrSvg={qrSvg} />
      </div>
    </div>
  )
}
