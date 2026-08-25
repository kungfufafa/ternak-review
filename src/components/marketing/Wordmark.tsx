import { BrandMark } from '#/components/brand-mark'

export function Wordmark() {
  return (
    <span className="wordmark">
      <BrandMark className="wordmark-mark" title="" />
      <span className="wordmark-text">
        Ternak<em>Review</em>
      </span>
    </span>
  )
}
