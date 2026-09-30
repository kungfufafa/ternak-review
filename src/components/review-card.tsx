import { BrandMark } from '#/components/brand-mark'
import { FreeCard } from '#/components/free-card'
import {
  cardDesignCssVars,
  defaultCardDesign,
  isFreeDesign,
  type CardDesign,
} from '#/lib/card-design'
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

function NfcHand() {
  return (
    <svg aria-hidden="true" className="review-card-nfc" viewBox="0 0 64 64">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.1"
      >
        <rect height="38" rx="4" width="22" x="18" y="4" />
        <path d="M23 9h12" />
        <circle cx="29" cy="37" fill="currentColor" r="1.6" stroke="none" />
        <path d="M11 38c.6 9.6 8 16 17.4 16h7.2c9.4 0 16.8-6.4 17.4-16" />
        <path d="M46 25c3.4 3.4 3.4 9.6 0 13" />
        <path d="M52 21c5.6 5.6 5.6 15.4 0 21" />
        <path d="M58 17c7.8 7.8 7.8 21.4 0 29.2" />
      </g>
    </svg>
  )
}

function MerchantLogo({
  design,
  className,
}: {
  design: CardDesign
  className: string
}) {
  return design.logo ? (
    <img
      alt=""
      className={cn(className, 'review-card-merchant-logo')}
      src={design.logo}
    />
  ) : (
    <BrandMark className={className} title="" />
  )
}

function NfcIcon({ icon }: { icon: CardDesign['nfcIcon'] }) {
  return icon === 'hand' ? <NfcHand /> : <NfcTap />
}

function ActionCaption({ text }: { text: string }) {
  return text ? <p className="review-card-action-caption">{text}</p> : null
}

export function ReviewCard({
  qrSvg,
  className,
  design,
}: {
  qrSvg?: string
  className?: string
  design?: CardDesign
}) {
  const d = design ?? defaultCardDesign()
  if (isFreeDesign(d)) {
    return <FreeCard className={className} design={d} qrSvg={qrSvg} />
  }
  const showNfc = d.showNfc || !d.showQr
  const showQr = d.showQr
  const showOr = showNfc && showQr
  const hero = d.logoStyle === 'hero'
  const nfcIcon = <NfcIcon icon={d.nfcIcon} />

  return (
    <article
      className={cn('review-card', className)}
      style={cardDesignCssVars(d)}
    >
      <div className="review-card-frame">
        <div className="review-card-face">
          <div className="review-card-head">
            {hero ? (
              <>
                <div className="review-card-hero">
                  <MerchantLogo
                    className="review-card-hero-mark"
                    design={d}
                  />
                </div>
                {d.merchantName ? (
                  <p className="review-card-merchant review-card-merchant-below">
                    {d.merchantName}
                  </p>
                ) : null}
              </>
            ) : d.logo || d.merchantName ? (
              <div className="review-card-merchant">
                {d.logo ? (
                  <MerchantLogo
                    className="review-card-merchant-mark"
                    design={d}
                  />
                ) : null}
                {!d.logo && d.merchantName ? (
                  <BrandMark className="review-card-merchant-mark" title="" />
                ) : null}
                {d.merchantName ? <span>{d.merchantName}</span> : null}
              </div>
            ) : null}
            {d.kicker ? <p className="review-card-kicker">{d.kicker}</p> : null}
            {d.title ? <p className="review-card-title">{d.title}</p> : null}
            {d.showStars ? <Stars /> : null}
          </div>

          {showNfc || showQr ? (
            <div className="review-card-main">
              {d.prompt ? (
                <p className="review-card-prompt">{d.prompt}</p>
              ) : null}
              {d.actionsLayout === 'split' ? (
                <div className="review-card-split">
                  {showNfc ? (
                    <div className="review-card-split-col">
                      <div className="review-card-split-glyph">{nfcIcon}</div>
                      <p className="review-card-action-label">
                        {d.nfcLabel}
                      </p>
                      <ActionCaption text={d.nfcCaption} />
                    </div>
                  ) : null}
                  {showOr ? (
                    <div aria-hidden="true" className="review-card-split-divider">
                      <span className="review-card-or">{d.orLabel}</span>
                    </div>
                  ) : null}
                  {showQr ? (
                    <div className="review-card-split-col">
                      <div
                        className="review-card-split-qr"
                        dangerouslySetInnerHTML={
                          qrSvg ? { __html: qrSvg } : undefined
                        }
                      />
                      <p className="review-card-action-label">
                        {d.qrLabel}
                      </p>
                      <ActionCaption text={d.qrCaption} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="review-card-actions">
                  {showNfc ? (
                    <div className="review-card-action">
                      <div className="review-card-glyph">{nfcIcon}</div>
                      <p className="review-card-action-label">
                        {d.nfcLabel}
                      </p>
                      <ActionCaption text={d.nfcCaption} />
                    </div>
                  ) : null}
                  {showOr ? (
                    <span className="review-card-or">{d.orLabel}</span>
                  ) : null}
                  {showQr ? (
                    <div className="review-card-action">
                      <div
                        className="review-card-qr"
                        dangerouslySetInnerHTML={
                          qrSvg ? { __html: qrSvg } : undefined
                        }
                      />
                      <p className="review-card-action-label">
                        {d.qrLabel}
                      </p>
                      <ActionCaption text={d.qrCaption} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {d.footer === 'cta' && d.cta ? (
            <p className="review-card-cta">{d.cta}</p>
          ) : null}
          {d.footer === 'pill' && d.cta ? (
            <p className="review-card-pill">
              <MerchantLogo className="review-card-pill-mark" design={d} />
              <span>{d.cta}</span>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
