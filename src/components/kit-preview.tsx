import { useEffect, useState } from 'react'
import { ReviewCard } from '#/components/review-card'
import { cardQrSvg } from '#/lib/qr'

export function KitPreview() {
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
        <ReviewCard qrSvg={qrSvg} />
      </div>
    </div>
  )
}
