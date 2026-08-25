import type { AffiliatePlatform } from '#/types/marketing'

export const AFFILIATE_PHOTO_SRC = '/images/step4.jpg'

export const affiliatePlatforms: AffiliatePlatform[] = [
  {
    key: 'instagram',
    value: 'Instagram',
    label: 'Username Instagram',
    placeholder: '@usernamekamu',
  },
  {
    key: 'tiktok',
    value: 'TikTok',
    label: 'Username TikTok',
    placeholder: '@usernamekamu',
  },
  {
    key: 'youtube',
    value: 'YouTube',
    label: 'Nama/Link Channel YouTube',
    placeholder: 'Nama channel atau link',
  },
  {
    key: 'facebook',
    value: 'Facebook',
    label: 'Username/Link Facebook',
    placeholder: 'Nama profil atau link',
  },
  {
    key: 'x',
    value: 'X (Twitter)',
    label: 'Username X (Twitter)',
    placeholder: '@usernamekamu',
  },
  {
    key: 'threads',
    value: 'Threads',
    label: 'Username Threads',
    placeholder: '@usernamekamu',
  },
]

export const affiliateBenefits = [
  {
    title: 'Komisi 20% Per Closing',
    desc: 'Tiap transaksi lewat link kamu, langsung dihitung 20% dari harga produk buat kamu.',
    icon: 'commission' as const,
  },
  {
    title: 'Nggak Perlu Modal / Stok',
    desc: 'Kamu cuma share link. Semua urusan kartu, supplier, dan pengiriman kami yang urus.',
    icon: 'stock' as const,
  },
  {
    title: 'Link Affiliate Pribadi',
    desc: 'Setelah diterima, kamu langsung dapet link affiliate pribadi yang tinggal kamu share ke followers atau kontak kamu.',
    icon: 'link' as const,
  },
]
