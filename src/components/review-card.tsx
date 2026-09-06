import { BrandMark } from '#/components/brand-mark'
import { cn } from '#/lib/utils'

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="review-card-g" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

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
        strokeWidth="2.6"
      >
        <rect height="38" rx="3.5" width="20" x="12" y="13" />
        <path d="M18 17.5h8" />
        <circle cx="22" cy="44.5" fill="currentColor" r="1.5" stroke="none" />
        <path d="M40 23c4.2 4.2 4.2 13.8 0 18" />
        <path d="M45.5 18c7 7 7 21 0 28" />
        <path d="M51 13c10 10 10 28 0 38" />
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
            <GoogleMark />
            <p className="review-card-kicker">Bantu kami dengan</p>
            <p className="review-card-title">Google Review</p>
            <Stars />
          </div>
          <div className="review-card-actions">
            <div className="review-card-action">
              <div className="review-card-glyph">
                <NfcTap />
              </div>
              <p>Tempel HP</p>
            </div>
            <span className="review-card-or">Atau</span>
            <div className="review-card-action">
              <div
                className="review-card-qr"
                dangerouslySetInnerHTML={
                  qrSvg ? { __html: qrSvg } : undefined
                }
              />
              <p>Scan QR</p>
            </div>
          </div>
          <div className="review-card-brand">
            <BrandMark className="review-card-brand-mark" title="" />
            <p className="review-card-brand-credit">@ternakreview</p>
          </div>
        </div>
      </div>
    </article>
  )
}
