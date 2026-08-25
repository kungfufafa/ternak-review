import { affiliateBenefits } from '#/components/marketing/affiliate/content'

export function AffiliateBenefits() {
  return (
    <section className="aff-benefits-section">
      <div className="wrap">
        <div className="aff-benefits-head reveal">
          <div className="section-label">Kenapa join</div>
          <h2 className="section-title">
            Share link. <em>Kami yang urus sisanya.</em>
          </h2>
        </div>
        <div className="aff-benefits reveal">
          {affiliateBenefits.map((item, index) => (
            <div key={item.title} className="aff-benefit">
              <span className="aff-benefit-num">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="aff-benefit-title">{item.title}</div>
              <div className="aff-benefit-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
