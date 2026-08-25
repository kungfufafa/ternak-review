import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '#/components/marketing/LegalPage'
import { WHATSAPP_LINK, marketingHead } from '#/components/marketing/content'

export const Route = createFileRoute('/kontak')({
  component: ContactPage,
  head: () =>
    marketingHead(
      'Kontak — Ternak Review',
      'Chat admin Ternak Review di WhatsApp. Senin–Jumat, 09.00–18.00 WIB.',
    ),
})

function ContactPage() {
  return (
    <LegalPage
      label="Kontak"
      title={
        <>
          Ada pertanyaan? <em>Chat aja</em>
        </>
      }
    >
      <p className="contact-lead">
        Sebelum beli, sesudah beli, atau ada kendala teknis — admin standby di
        WhatsApp.
      </p>
      <a
        className="btn btn-whatsapp"
        href={WHATSAPP_LINK}
        rel="noreferrer"
        target="_blank"
      >
        Chat WhatsApp
      </a>
      <div className="contact-grid">
        <div className="contact-card">
          <strong>Respon cepat</strong>
          <span>Biasanya dibalas dalam hitungan menit di jam kerja.</span>
        </div>
        <div className="contact-card">
          <strong>Senin–Jumat</strong>
          <span>Jam operasional 09.00–18.00 WIB.</span>
        </div>
        <div className="contact-card">
          <strong>Semua kendala</strong>
          <span>Tanya produk, aktivasi kartu, sampai supplier.</span>
        </div>
      </div>
      <p className="legal-note">
        Pesan di luar jam kerja tetap terkirim, dibalas begitu admin online di
        hari kerja berikutnya.
      </p>
    </LegalPage>
  )
}
