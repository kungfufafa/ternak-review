import { HERO_PHOTO_SRC } from '#/components/marketing/content'

export function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-frame">
        <img
          className="hero-photo"
          src={HERO_PHOTO_SRC}
          alt=""
          aria-hidden="true"
        />
        <div className="hero-scrim" />
        <div className="hero-inner">
          <div>
            <h1 className="intro-1">
              Modal Rp15.000.
              <br />
              <em>Cuan yang 10× lipat.</em>
            </h1>
            <p className="sub intro-2">
              Ubah kartu review Google jadi Rp50–165 ribu ke bisnis lokal di
              sekitar kamu. Tanpa followers, tanpa modal gede, tanpa jago
              jualan.
            </p>
            <div className="hero-ctas intro-3">
              <a href="#produk" className="btn btn-primary">
                Dapetin aksesnya
              </a>
              <a href="#cara-kerja" className="btn btn-ghost">
                Lihat cara kerjanya
              </a>
            </div>
          </div>
          <div className="hero-metrics">
            <div>
              <strong>Tanpa followers</strong>
              <span>Bukan jualan ke audiens online</span>
            </div>
            <div>
              <strong>Kartu Rp15.000</strong>
              <span>Langsung dari supplier di paket</span>
            </div>
            <div>
              <strong>Closing di tempat</strong>
              <span>Rp50–165 ribu per bisnis</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
