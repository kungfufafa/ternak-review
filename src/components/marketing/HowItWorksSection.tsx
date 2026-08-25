import { steps } from '#/components/marketing/content'

export function HowItWorksSection() {
  return (
    <section id="cara-kerja">
      <div className="wrap">
        <div className="section-label reveal">Cara kerja</div>
        <h2 className="section-title reveal">
          Empat langkah. <em>Ulang sampai closing.</em>
        </h2>
        <p className="section-sub reveal">
          Sistemnya pendek. Pesan kartunya, samperin bisnis lokal, closing di
          tempat, lalu scale dari reputasi.
        </p>
        <div className="step-grid reveal">
          {steps.map((step, index) => (
            <div key={step.num} className="step-card">
              <div className="step-media">
                <img src={step.image} alt={step.imageAlt} />
              </div>
              <div className="step-body">
                <span className="step-num">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="step-title">{step.title}</div>
                <div className="step-desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
