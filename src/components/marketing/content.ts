import type {
  FaqItem,
  FooterLink,
  HowItWorksStep,
  ProductTier,
} from '#/types/marketing'

const IMG = '/images'
export const HERO_PHOTO_SRC = `${IMG}/step2.jpg`

export const LYNK_LINKS = {
  supplier: 'http://lynk.id/raymondkristanto/p731xwqk8e7k/checkout',
  guide: 'http://lynk.id/raymondkristanto/o95v8mrmznmz/checkout',
} as const

export const products: ProductTier[] = [
  {
    id: 'supplier',
    name: 'Akses Supplier Eksklusif',
    popular: false,
    image: `${IMG}/tier1-new.jpg`,
    imageAlt: 'Akses Supplier Eksklusif kartu NFC Google Review',
    bullets: [
      'Akses Supplier Termurah Cuma Rp.15.000',
      'Tanpa Minimum Order',
      'Panduan Aktivasi Kartu',
    ],
    price: 'Rp69.000',
    terms: 'Sekali bayar · Akses instan',
    hasTimer: false,
    checkoutUrl: LYNK_LINKS.supplier,
  },
  {
    id: 'guide',
    name: 'Panduan Lengkap A–Z',
    popular: true,
    image: `${IMG}/tier2.jpg`,
    imageAlt: 'Panduan Lengkap A-Z kartu NFC Google Review',
    bullets: [
      'Akses Supplier Termurah Cuma Rp.15.000',
      'Tanpa Minimum Order',
      'Panduan Aktivasi Kartu',
      'Cara Cari Client',
      'Cara Handle Client Sampai Deal',
      'Cara Scale Bisnisnya',
    ],
    price: 'Rp149.000',
    strike: 'Rp350.000',
    terms: 'Sekali bayar · Akses instan · Berlaku selamanya',
    hasTimer: true,
    checkoutUrl: LYNK_LINKS.guide,
  },
]

export const steps: HowItWorksStep[] = [
  {
    num: 'Step 1',
    title: 'Pesan Kartu NFC-nya',
    desc: 'Cuma Rp15.000/pcs, langsung dari supplier yang udah termasuk di paket kamu.',
    image: `${IMG}/step1.jpg`,
    imageAlt: 'Pesan kartu NFC dari supplier',
  },
  {
    num: 'Step 2',
    title: 'Samperin Bisnis Lokal',
    desc: 'Resto, salon, barbershop, kafe — bisnis yang butuh review Google biar makin dipercaya orang.',
    image: `${IMG}/step2.jpg`,
    imageAlt: 'Samperin bisnis lokal',
  },
  {
    num: 'Step 3',
    title: 'Closing di Tempat',
    desc: 'Pakai script obrolan dari panduan, Rp50–165 ribu per kartu tergantung bisnisnya.',
    image: `${IMG}/step3.jpg`,
    imageAlt: 'Closing di tempat',
  },
  {
    num: 'Step 4',
    title: 'Ulangi & Scale',
    desc: 'Satu bisnis puas, kamu akan lebih gampang direkomendasiin ke bisnis lain di sekitarnya. Reputasi kamu tumbuh dan closing berikutnya jauh lebih cepat.',
    image: `${IMG}/step4.jpg`,
    imageAlt: 'Ulangi dan scale bisnis',
  },
]

export const faqs: FaqItem[] = [
  {
    question: 'Aku butuh followers atau modal gede nggak?',
    answer:
      'Nggak sama sekali. Seluruh sistem ini fokus ke closing langsung ke pemilik bisnis lokal — jalan kaki masuk toko atau lewat DM/telepon — bukan jualan online yang butuh audiens atau followers.',
  },
  {
    question: 'Berapa modal awal yang aku butuhin?',
    answer:
      'Mulai dari Rp69.000 buat akses supplier. Satu kartu NFC harganya cuma Rp15.000, dan hasil closing per kartu ke bisnis bisa Rp50.000–165.000 atau lebih.',
  },
  {
    question: 'Berapa banyak cuan yang bisa aku dapat sebenarnya?',
    answer:
      'Tergantung jenis bisnis yang kamu deketin. Ke warung/toko kecil biasanya closing di kisaran Rp50.000–75.000 per kartu. Ke bisnis yang lebih besar (resto rame, klinik, bisnis yang udah punya banyak cabang) closing-nya bisa Rp100.000–165.000 karena value review Google buat mereka jauh lebih besar. Semua script & cara nego harga sesuai jenis bisnis ada di panduan.',
  },
  {
    question: 'Beneran bisa cuan sampai 10x lipat dari modal?',
    answer:
      'Bisa, tapi bukan otomatis di setiap kartu. Modal kartu Rp15.000 — kalau kamu closing ke bisnis yang lebih besar di kisaran Rp150.000, itu udah 10x lipat dari modal. Angka pastinya tergantung ke bisnis apa kamu jual, seberapa sering kamu closing, dan skill nego kamu. Makin gede & makin butuh review bisnisnya, makin tinggi juga harga yang bisa kamu tawarkan.',
  },
  {
    question: 'Bedanya dua paket ini apa?',
    answer:
      'Akses Supplier cuma berisi kontak supplier kartu — cara closingnya kamu cari sendiri. Panduan Lengkap A–Z udah termasuk akses supplier plus semua script, strategi deketin bisnis, dan cara scale, jadi paling cocok buat yang baru mulai.',
  },
  {
    question: 'Kapan aku dapat akses setelah bayar?',
    answer:
      'Instan. Begitu pembayaran berhasil, link dan materinya langsung otomatis terkirim lewat sistem checkout.',
  },
  {
    question: 'Ini bisa dijalanin di luar kota besar juga?',
    answer:
      'Bisa banget, di kota mana aja. Bisnis lokal yang butuh review Google ada di mana-mana — dari kota besar sampai kabupaten.',
  },
  {
    question: 'Kartu NFC/QR-nya cara kerjanya gimana?',
    answer:
      'Tinggal tap HP ke kartu (kalau HP-nya support NFC) atau scan QR yang ada di kartu. Pelanggan langsung diarahkan ke halaman review Google bisnis itu, tanpa perlu cari-cari sendiri. Prosesnya kurang dari 5 detik.',
  },
  {
    question: 'Metode pembayarannya apa aja?',
    answer:
      'Checkout lewat Lynk.id, jadi kamu bisa bayar pakai transfer bank, e-wallet (OVO, DANA, GoPay, ShopeePay), QRIS, sampai kartu debit/kredit.',
  },
  {
    question: 'Kalau ada kendala pas aktivasi atau butuh bantuan, gimana caranya?',
    answer:
      'Chat langsung admin kami di WhatsApp lewat halaman Kontak, biasanya dibalas dalam hitungan menit di jam kerja (Senin–Jumat, 09.00–18.00 WIB).',
    contactHref: '/kontak',
  },
]

export const WHATSAPP_LINK = 'https://wa.link/lhqfv0'

export const MARKETING_ICON_LINKS = [
  {
    rel: 'icon' as const,
    type: 'image/svg+xml',
    href: '/favicon.svg',
  },
  {
    rel: 'icon' as const,
    type: 'image/png',
    sizes: '64x64',
    href: '/favicon.png',
  },
  {
    rel: 'apple-touch-icon' as const,
    href: '/apple-touch-icon.png',
  },
]

export function marketingHead(title: string, description: string) {
  return {
    meta: [{ title }, { name: 'description', content: description }],
    links: MARKETING_ICON_LINKS,
  }
}

export const footerLinks: FooterLink[] = [
  { href: '/affiliate', label: 'Program Affiliate (Komisi 20%)', affiliate: true },
  { href: '/kebijakan-privasi', label: 'Kebijakan Privasi' },
  { href: '/syarat-ketentuan', label: 'Syarat & Ketentuan' },
  { href: '/kebijakan-refund', label: 'Kebijakan Refund' },
  { href: '/kontak', label: 'Kontak' },
]
