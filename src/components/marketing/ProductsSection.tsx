import { CheckIcon } from '#/components/marketing/icons'
import { products } from '#/components/marketing/content'
import { usePromoTimer } from '#/hooks/use-promo-timer'

export function ProductsSection() {
  const timer = usePromoTimer()

  return (
    <section id="produk">
      <div className="wrap">
        <div className="section-label reveal">Produk</div>
        <h2 className="section-title reveal">
          Dua paket. <em>Pilih yang pas.</em>
        </h2>
        <p className="section-sub reveal">
          Satu untuk akses supplier. Satu lagi kalau kamu mau script, closing,
          dan cara scale-nya sekalian.
        </p>
        <div className="products-grid reveal">
          {products.map((product) => (
            <div
              key={product.id}
              className={
                product.popular ? 'product-card popular' : 'product-card'
              }
            >
              <div className="product-media">
                {product.popular ? (
                  <div className="badge-popular">Paling dipakai</div>
                ) : null}
                <img src={product.image} alt={product.imageAlt} />
              </div>
              <div className="product-body">
                <div className="product-name">{product.name}</div>
                <ul className="product-bullets">
                  {product.bullets.map((bullet) => (
                    <li key={bullet}>
                      <CheckIcon />
                      <span>
                        <strong>{bullet}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="price-row">
                  <span className="price-now">{product.price}</span>
                  {product.strike ? (
                    <span className="price-strike">{product.strike}</span>
                  ) : null}
                </div>
                {product.hasTimer ? (
                  <div className="promo-timer">
                    Penawaran berakhir {timer}
                  </div>
                ) : null}
                <div className="price-terms">{product.terms}</div>
                <a
                  className="buy-btn"
                  href={product.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ambil sekarang
                </a>
              </div>
            </div>
          ))}
        </div>
        <div className="unit-note reveal">
          Harga kartu NFC dari supplier cuma <strong>Rp15.000/pcs</strong>.
          Closing satu kartu ke bisnis bisa Rp50.000–165.000.
        </div>
      </div>
    </section>
  )
}
