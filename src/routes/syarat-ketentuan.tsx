import { Link, createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '#/components/marketing/LegalPage'
import { marketingHead } from '#/components/marketing/content'

export const Route = createFileRoute('/syarat-ketentuan')({
  component: TermsPage,
  head: () =>
    marketingHead(
      'Syarat & Ketentuan — Ternak Review',
      'Aturan pakai situs, paket digital, dan kartu review Ternak Review.',
    ),
})

function TermsPage() {
  return (
    <LegalPage
      label="Legal"
      title={
        <>
          Syarat & <em>Ketentuan</em>
        </>
      }
      updated="24 Agustus 2026"
    >
      <p>
        Dengan membuka situs ini, beli paket, atau memakai kartu Ternak Review,
        kamu dianggap sudah membaca dan setuju dengan ketentuan di bawah.
      </p>

      <h2>1. Tentang produk</h2>
      <p>Ternak Review menyediakan:</p>
      <ul>
        <li>
          <strong>Akses Supplier Eksklusif</strong> — kontak supplier kartu
          NFC/QR yang kami pakai.
        </li>
        <li>
          <strong>Panduan Lengkap A–Z</strong> — materi jadi reseller kartu
          review ke bisnis lokal, sudah termasuk akses supplier.
        </li>
        <li>
          <strong>Kartu review</strong> — QR + NFC yang setelah diaktivasi
          mengarah ke halaman tulis review Google toko yang dipilih.
        </li>
      </ul>
      <p>
        Paket digital dikirim instan setelah pembayaran dikonfirmasi sistem
        checkout.
      </p>

      <h2>2. Pembelian & pembayaran</h2>
      <p>
        Transaksi paket diproses lewat <strong>Lynk.id</strong>. Metode bayar,
        keamanan, dan bukti pembayaran tunduk pada syarat Lynk.id.
      </p>

      <h2>3. Lisensi materi</h2>
      <p>
        Setelah beli, kamu dapat hak pakai pribadi (tidak eksklusif, tidak bisa
        dipindahtangankan). Kamu tidak boleh:
      </p>
      <ul>
        <li>Membagikan ulang, menjual, atau mempublikasikan materi ke orang lain</li>
        <li>Mengaku materi ini sebagai karya sendiri</li>
      </ul>
      <p>
        Pelanggaran bisa berakibat akses diputus tanpa pengembalian dana.
      </p>

      <h2>4. Kartu & aktivasi</h2>
      <p>
        Kartu mengarah ke listing Google Maps yang dipilih saat aktivasi. Kamu
        bertanggung jawab memilih toko yang benar. URL di kertas dan chip tidak
        berubah kalau domain diganti belakangan.
      </p>
      <p>
        Kami tidak menjamin uptime 100%, dan tidak bertanggung jawab atas
        kebijakan Google Review (akun, rating, moderasi).
      </p>

      <h2>5. Disclaimer hasil</h2>
      <p>
        Angka pendapatan di situs (misalnya Rp50.000–165.000 per closing, atau
        10× modal) adalah ilustrasi, bukan jaminan. Hasil tergantung usaha,
        lokasi, jenis bisnis, dan cara kamu closing.
      </p>

      <h2>6. Perubahan harga & produk</h2>
      <p>
        Kami bisa mengubah harga, isi materi, atau promo kapan saja. Perubahan
        tidak berlaku surut untuk transaksi yang sudah selesai.
      </p>

      <h2>7. Batasan tanggung jawab</h2>
      <p>
        Kami menyediakan panduan, kontak supplier, dan sistem kartu. Kami tidak
        bertanggung jawab atas kualitas kartu dari supplier, atau hasil
        negosiasi kamu dengan bisnis lain.
      </p>

      <h2>8. Hak cipta</h2>
      <p>
        Konten, desain, dan materi di situs ini milik Ternak Review. Dilarang
        disalin atau dipakai komersial tanpa izin tertulis.
      </p>

      <h2>9. Kontak</h2>
      <p>
        Pertanyaan soal syarat ini lewat halaman{' '}
        <Link to="/kontak">Kontak</Link>.
      </p>
    </LegalPage>
  )
}
