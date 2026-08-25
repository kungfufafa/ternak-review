import { Link, createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '#/components/marketing/LegalPage'
import { WHATSAPP_LINK, marketingHead } from '#/components/marketing/content'

export const Route = createFileRoute('/kebijakan-refund')({
  component: RefundPage,
  head: () =>
    marketingHead(
      'Kebijakan Refund — Ternak Review',
      'Kapan refund bisa diajukan untuk paket digital Ternak Review, dan cara klaimnya.',
    ),
})

function RefundPage() {
  return (
    <LegalPage
      label="Legal"
      title={
        <>
          Kebijakan <em>Refund</em>
        </>
      }
      updated="24 Agustus 2026"
    >
      <p>
        Akses Supplier Eksklusif dan Panduan Lengkap A–Z adalah produk digital
        yang dikirim instan setelah bayar. Karena sifatnya instan, berlaku
        ketentuan berikut.
      </p>

      <h2>1. Kapan refund bisa diajukan</h2>
      <p>Refund berlaku kalau:</p>
      <ul>
        <li>
          Pembayaran berhasil tapi kamu tidak terima akses/link dalam 1×24 jam
        </li>
        <li>
          Link atau materi rusak, tidak bisa dibuka, atau tidak sesuai produk
          yang dibeli
        </li>
        <li>Kamu tidak sengaja bayar dobel untuk produk yang sama</li>
      </ul>
      <p>
        Ajukan klaim maksimal <strong>3×24 jam</strong> setelah transaksi,
        lengkap dengan bukti pembayaran Lynk.id.
      </p>

      <h2>2. Kapan refund tidak berlaku</h2>
      <ul>
        <li>
          Materi sudah dibuka/diakses — produk digital tidak bisa
          “dikembalikan”
        </li>
        <li>Berubah pikiran setelah materi diterima</li>
        <li>
          Closing/cuan tidak sesuai ekspektasi — hasil tergantung eksekusi kamu,
          bukan kesalahan produk (lihat{' '}
          <Link to="/syarat-ketentuan">Syarat & Ketentuan</Link>)
        </li>
        <li>Salah isi data (misalnya email) dari pihak pembeli</li>
      </ul>

      <h2>3. Cara mengajukan</h2>
      <p>
        Hubungi kami lewat <Link to="/kontak">Kontak</Link> atau{' '}
        <a href={WHATSAPP_LINK} rel="noreferrer" target="_blank">
          WhatsApp
        </a>
        , sertakan:
      </p>
      <ul>
        <li>Nama dan email saat checkout</li>
        <li>Bukti pembayaran Lynk.id</li>
        <li>Alasan pengajuan</li>
      </ul>
      <p>
        Kami tinjau dalam <strong>1–3 hari kerja</strong>.
      </p>

      <h2>4. Pengembalian dana</h2>
      <p>
        Kalau disetujui, dana kembali lewat metode bayar yang sama, lewat
        Lynk.id, maksimal <strong>7 hari kerja</strong> sejak persetujuan.
      </p>
    </LegalPage>
  )
}
