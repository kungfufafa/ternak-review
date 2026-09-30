import { BrandMark } from '#/components/brand-mark'
import {
  cardDesignCssVars,
  FACE_MM,
  type CardDesign,
  type CardElement,
} from '#/lib/card-design'
import { cn } from '#/lib/utils'

const pct = (v: number) => `${((v / FACE_MM) * 100).toFixed(4)}%`
// cqi units resolve against the full card width (98mm).
const cqi = (v: number) => `${((v / 98) * 100).toFixed(3)}cqi`

function ElementStars({ el }: { el: Extract<CardElement, { type: 'stars' }> }) {
  const star = Math.min(el.h, el.w / 5.8)
  const gap = Math.max(0, (el.w - 5 * star) / 4)
  return (
    <div
      className="free-el-stars"
      style={{ gap: cqi(gap), color: el.color }}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          style={{ width: cqi(star), height: cqi(star) }}
          viewBox="0 0 24 24"
        >
          <path
            d="M12 2.4 14.7 8.3l6.5.9-4.7 4.6 1.1 6.4L12 17.2 6.4 20.2l1.1-6.4L2.8 9.2l6.5-.9z"
            fill="currentColor"
          />
        </svg>
      ))}
    </div>
  )
}

function NfcIconSvg({
  icon,
  color,
}: {
  icon: 'tap' | 'hand'
  color: string
}) {
  return (
    <svg
      aria-hidden="true"
      style={{ color, width: icon === 'hand' ? '92%' : '100%', height: icon === 'hand' ? '92%' : '100%' }}
      viewBox="0 0 64 64"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.1"
      >
        {icon === 'tap' ? (
          <>
            <rect height="46" rx="4.4" width="24" x="6" y="9" />
            <path d="M12.5 14.4h11" />
            <circle cx="18" cy="49" fill="currentColor" r="1.8" stroke="none" />
            <path d="M40 23c5 5 5 14 0 19" />
            <path d="M46 17c7.6 7.6 7.6 22.4 0 30" />
            <path d="M52 11.5c10.6 10.6 10.6 30.4 0 41" />
          </>
        ) : (
          <>
            <rect height="38" rx="4" width="22" x="18" y="4" />
            <path d="M23 9h12" />
            <circle cx="29" cy="37" fill="currentColor" r="1.6" stroke="none" />
            <path d="M11 38c.6 9.6 8 16 17.4 16h7.2c9.4 0 16.8-6.4 17.4-16" />
            <path d="M46 25c3.4 3.4 3.4 9.6 0 13" />
            <path d="M52 21c5.6 5.6 5.6 15.4 0 21" />
            <path d="M58 17c7.8 7.8 7.8 21.4 0 29.2" />
          </>
        )}
      </g>
    </svg>
  )
}

function ElementView({
  el,
  design,
  qrSvg,
}: {
  el: CardElement
  design: CardDesign
  qrSvg?: string
}) {
  switch (el.type) {
    case 'text':
      return (
        <div
          className="free-el-text"
          style={{
            color: el.color,
            background: el.bg ?? undefined,
            borderRadius: el.bg ? cqi(el.bgRadius) : undefined,
            border: el.border ? `${cqi(0.3)} solid rgb(32 33 36 / 16%)` : undefined,
            fontSize: cqi(el.size),
            fontWeight: el.bold ? 700 : 500,
            textAlign: el.align,
            justifyContent:
              el.align === 'left'
                ? 'flex-start'
                : el.align === 'right'
                  ? 'flex-end'
                  : 'center',
            textTransform: el.upper ? 'uppercase' : undefined,
          }}
        >
          {el.text}
        </div>
      )
    case 'logo':
      return design.logo ? (
        <img
          alt=""
          className="free-el-fill"
          src={design.logo}
        />
      ) : (
        <BrandMark className="free-el-fill" title="" />
      )
    case 'qr': {
      const brackets = el.corner === true && el.border
      return (
        <>
          <div
            className="free-el-qr"
            style={{
              background: el.bg ?? '#ffffff',
              border:
                !brackets && el.border
                  ? `${cqi(0.4)} solid ${el.borderColor}`
                  : undefined,
            }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          {brackets ? (
            <div
              aria-hidden="true"
              className="qr-corners"
              style={{ color: el.borderColor }}
            >
              <i data-pos="tl" />
              <i data-pos="tr" />
              <i data-pos="bl" />
              <i data-pos="br" />
            </div>
          ) : null}
        </>
      )
    }
    case 'nfc':
      return (
        <div
          className="free-el-nfc"
          style={{
            color: el.color,
            background: el.bg ?? undefined,
            borderRadius: el.bg ? cqi(el.bgRadius) : undefined,
          }}
        >
          <NfcIconSvg color={el.color} icon={el.icon} />
        </div>
      )
    case 'stars':
      return <ElementStars el={el} />
    case 'divider':
      return (
        <div className="free-el-divider" style={{ background: el.color }}>
          {el.label ? (
            <span
              className="free-el-divider-label"
              style={{ color: el.labelColor, fontSize: cqi(2.2) }}
            >
              {el.label}
            </span>
          ) : null}
        </div>
      )
  }
}

export function FreeCard({
  design,
  qrSvg,
  className,
}: {
  design: CardDesign
  qrSvg?: string
  className?: string
}) {
  return (
    <article
      className={cn('review-card', className)}
      style={cardDesignCssVars(design)}
    >
      <div className="review-card-frame">
        <div className="review-card-face free-face">
          {(design.elements ?? []).map((el) => (
            <div
              className="free-el"
              key={el.id}
              style={{
                left: pct(el.x),
                top: pct(el.y),
                width: pct(el.w),
                height: pct(el.h),
              }}
            >
              <ElementView design={design} el={el} qrSvg={qrSvg} />
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
