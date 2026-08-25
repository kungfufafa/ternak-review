import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { PlusIcon } from '#/components/marketing/icons'
import { faqs } from '#/components/marketing/content'

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq">
      <div className="wrap">
        <div className="section-label reveal">FAQ</div>
        <h2 className="section-title reveal">
          Pertanyaan yang <em>sering ditanyain.</em>
        </h2>
        <div className="faq-list reveal">
          {faqs.map((item, index) => {
            const open = openIndex === index
            return (
              <div
                key={item.question}
                className={open ? 'faq-item open' : 'faq-item'}
              >
                <button
                  type="button"
                  className="faq-q"
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  {item.question}
                  <PlusIcon className="icon" />
                </button>
                <div className="faq-a">
                  <div className="faq-a-inner">
                    {item.contactHref ? (
                      <>
                        Chat langsung admin kami di WhatsApp lewat halaman{' '}
                        <Link to="/kontak">Kontak</Link>, biasanya dibalas
                        dalam hitungan menit di jam kerja (Senin–Jumat,
                        09.00–18.00 WIB).
                      </>
                    ) : (
                      item.answer
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
