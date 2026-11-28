export interface ProductTier {
  id: 'supplier' | 'guide'
  name: string
  popular: boolean
  image: string
  imageAlt: string
  bullets: string[]
  price: string
  strike?: string
  terms: string
  hasTimer: boolean
  checkoutUrl: string
}

export interface HowItWorksStep {
  num: string
  title: string
  desc: string
  image: string
  imageAlt: string
}

export interface FaqItem {
  question: string
  answer: string
  contactHref?: string
}

export interface FooterLink {
  href:
    | '/affiliate'
    | '/kebijakan-privasi'
    | '/syarat-ketentuan'
    | '/kebijakan-refund'
    | '/kontak'
  label: string
  affiliate?: boolean
}

export type AffiliatePlatformKey =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'x'
  | 'threads'

export interface AffiliatePlatform {
  key: AffiliatePlatformKey
  value: string
  label: string
  placeholder: string
}

export const AFFILIATE_PLATFORM_KEYS = [
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'x',
  'threads',
] as const

export const AFFILIATE_STATUSES = ['pending', 'approved', 'rejected'] as const
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number]
export const affiliateStatusLabels: Record<AffiliateStatus, string> = {
  pending: 'Menunggu review',
  approved: 'Diterima',
  rejected: 'Ditolak',
}

export interface AffiliateLeadInput {
  nama: string
  email: string
  whatsapp: string
  platforms: AffiliatePlatformKey[]
  usernames: Partial<Record<AffiliatePlatformKey, string>>
}

export type AffiliateFieldErrors = Record<string, boolean>

export type AffiliateSubmitResult =
  | { ok: true }
  | { ok: false; error: string; fields: AffiliateFieldErrors }
