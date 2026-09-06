import { Link, createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '#/components/marketing/LegalPage'
import { WHATSAPP_LINK, marketingHead } from '#/components/marketing/content'

export const Route = createFileRoute('/kebijakan-privasi')({
  component: PrivacyPage,
  head: () =>
    marketingHead(
      'Kebijakan Privasi — Ternak Review',
      'Bagaimana Ternak Review mengumpulkan, memakai, dan menjaga data kamu.',
    ),
})

function PrivacyPage() {
  return (
    <LegalPage
      label="Legal"
      title={
        <>
          Kebijakan <em>Privasi</em>
        </>
      }
      updated="24 Agustus 2026"
    >
      <p>
        Ternak Review menghargai privasi kamu. Halaman ini menjelaskan data apa
        yang kami kumpulkan saat kamu memakai situs ini, beli paket, daftar
        affiliate, atau mengaktifkan kartu review — dan bagaimana data itu
        dipakai.
      </p>

      <h2>1. Data yang kami kumpulkan</h2>
      <p>
        Saat checkout lewat Lynk.id, data yang terkumpul biasanya nama, email,
        dan nomor WhatsApp (kalau diminta Lynk.id). Informasi pembayaran
        diproses Lynk.id — kami tidak menerima atau menyimpan data kartu,
        rekening, atau e-wallet kamu.
      </p>
      <p>
        Kalau kamu chat WhatsApp, kami menyimpan nomor dan isi pesan untuk
        membalas. Form affiliate menyimpan nama, email, WhatsApp, dan akun
        sosial yang kamu isi.
      </p>
      <p>
        Saat kartu diaktifkan, kami menyimpan listing Google Maps yang dipilih
        (nama, alamat, place ID) dan tag rekanan kalau diisi. Scan/tap kartu
        bisa mencatat waktu, jenis perangkat, dan hash IP — bukan alamat IP
        mentah.
      </p>
      <p>
        Untuk paket WhatsApp, nomor owner disimpan sebagai tujuan kartu. Pesan
        feedback anonim tidak meminta atau meneruskan nama, nomor, atau
        identitas tamu.
      </p>

      <h2>2. Bagaimana data dipakai</h2>
      <ul>
        <li>Mengirim akses produk setelah pembayaran berhasil</li>
        <li>Membalas pertanyaan atau kendala</li>
        <li>Menjalankan kartu: aktivasi toko, Google Review, dan feedback sesuai paket</li>
        <li>
          Menyimpan masukan anonim yang dikirim tamu tanpa nama atau nomor
          telepon, lalu meneruskannya ke WhatsApp owner melalui gateway kami
        </li>
        <li>Melacak performa kartu di dashboard admin</li>
      </ul>
      <p>
        Kami tidak menjual atau menyewakan data kamu ke pihak lain untuk iklan.
      </p>

      <h2>3. Pihak ketiga</h2>
      <ul>
        <li>
          <strong>Lynk.id</strong> — pembayaran dan pengiriman akses. Tunduk
          pada kebijakan privasi mereka.
        </li>
        <li>
          <strong>Google</strong> — Places/Maps saat pilih toko, dan halaman
          tulis review.
        </li>
        <li>
          <strong>Penyedia hosting</strong> — menjalankan situs dan database.
        </li>
      </ul>

      <h2>4. Penyimpanan & keamanan</h2>
      <p>
        Data disimpan selama diperlukan untuk transaksi, layanan kartu, dan
        bantuan. Kami menjaga data dengan wajar, meski tidak ada sistem yang
        100% bebas risiko.
      </p>

      <h2>5. Hak kamu</h2>
      <p>
        Kamu berhak minta kami hapus data pribadi yang kami simpan sendiri (di
        luar data di Lynk.id) lewat halaman{' '}
        <Link to="/kontak">Kontak</Link>.
      </p>

      <h2>6. Perubahan</h2>
      <p>
        Kebijakan ini bisa diperbarui. Perubahan berlaku begitu dipublikasikan
        di halaman ini.
      </p>

      <h2>7. Kontak</h2>
      <p>
        Pertanyaan soal data? Hubungi kami di{' '}
        <Link to="/kontak">Kontak</Link> atau{' '}
        <a href={WHATSAPP_LINK} rel="noreferrer" target="_blank">
          WhatsApp
        </a>
        .
      </p>
    </LegalPage>
  )
}
