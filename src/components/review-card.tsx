import { BrandMark } from '#/components/brand-mark'
import { cn } from '#/lib/utils'

function Stars() {
  return (
    <div className="review-card-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24">
          <path
            d="M12 2.4 14.7 8.3l6.5.9-4.7 4.6 1.1 6.4L12 17.2 6.4 20.2l1.1-6.4L2.8 9.2l6.5-.9z"
            fill="currentColor"
          />
        </svg>
      ))}
    </div>
  )
}

function NfcTap() {
  return (
    <svg aria-hidden="true" className="review-card-nfc" viewBox="0 0 64 64">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.1"
      >
        <rect height="46" rx="4.4" width="24" x="6" y="9" />
        <path d="M12.5 14.4h11" />
        <circle cx="18" cy="49" fill="currentColor" r="1.8" stroke="none" />
        <path d="M40 23c5 5 5 14 0 19" />
        <path d="M46 17c7.6 7.6 7.6 22.4 0 30" />
        <path d="M52 11.5c10.6 10.6 10.6 30.4 0 41" />
      </g>
    </svg>
  )
}

export function ReviewCard({
  qrSvg,
  className,
}: {
  qrSvg?: string
  className?: string
}) {
  return (
    <article className={cn('review-card', className)}>
      <div className="review-card-frame">
        <div className="review-card-face">
          <div className="review-card-head">
            <div className="review-card-merchant">
              <BrandMark className="review-card-merchant-mark" title="" />
              <span>@TernakReview</span>
            </div>
            <p className="review-card-kicker">Bantu kami dengan</p>
            <p className="review-card-title">Google Review</p>
            <Stars />
          </div>
          <div className="review-card-main">
            <p className="review-card-prompt">
              Tap atau scan untuk memberi ulasan
            </p>
            <div className="review-card-actions">
              <div className="review-card-glyph">
                <NfcTap />
              </div>
              <span className="review-card-or">atau</span>
              <div
                className="review-card-qr"
                dangerouslySetInnerHTML={
                  qrSvg ? { __html: qrSvg } : undefined
                }
              />
              <p className="review-card-action-label">Tap NFC</p>
              <span className="review-card-or-gap" aria-hidden="true" />
              <p className="review-card-action-label">Scan QR</p>
            </div>
          </div>
          <p className="review-card-cta">
            Pendapat Anda berarti bagi kami
          </p>
        </div>
      </div>
    </article>
  )
}
