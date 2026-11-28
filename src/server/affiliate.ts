import { and, count, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import { affiliateLeads } from '#/db/schema'
import { getPublicSiteFlags } from '#/server/site'
import {
  AFFILIATE_PLATFORM_KEYS,
  type AffiliateFieldErrors,
  type AffiliateLeadInput,
  type AffiliatePlatformKey,
  type AffiliateSubmitResult,
  type AffiliateStatus,
} from '#/types/marketing'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PLATFORM_SET = new Set<string>(AFFILIATE_PLATFORM_KEYS)
const MAX_NAME_LENGTH = 120
const MAX_EMAIL_LENGTH = 254
const MAX_WHATSAPP_LENGTH = 32
const MAX_USERNAME_LENGTH = 100

function isPlatformKey(value: string): value is AffiliatePlatformKey {
  return PLATFORM_SET.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function digits(value: string): string {
  return value.replace(/[^\d]/g, '')
}

type AffiliateValidation =
  | { ok: true; data: AffiliateLeadInput }
  | { ok: false; fields: AffiliateFieldErrors; error: string }

export function validateAffiliateLead(body: unknown): AffiliateValidation {
  if (!isRecord(body)) {
    return {
      ok: false,
      fields: {},
      error: 'Data pendaftaran tidak valid.',
    }
  }

  const fields: AffiliateFieldErrors = {}
  const nama = readString(body.nama)
  const email = readString(body.email)
  const whatsapp = readString(body.whatsapp)

  if (!nama || nama.length > MAX_NAME_LENGTH) fields.nama = true
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    fields.email = true
  }
  if (whatsapp.length > MAX_WHATSAPP_LENGTH) fields.whatsapp = true
  if (digits(whatsapp).length < 9 || digits(whatsapp).length > 15) {
    fields.whatsapp = true
  }

  const rawPlatforms = Array.isArray(body.platforms) ? body.platforms : []
  const platforms = rawPlatforms
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(isPlatformKey)
    .filter((value, index, all) => all.indexOf(value) === index)

  if (platforms.length === 0) fields.platforms = true

  const rawUsernames = isRecord(body.usernames) ? body.usernames : {}
  const usernames: AffiliateLeadInput['usernames'] = {}

  for (const key of platforms) {
    const value = readString(rawUsernames[key])
    if (!value || value.length > MAX_USERNAME_LENGTH) {
      fields[`user-${key}`] = true
    } else {
      usernames[key] = value
    }
  }

  if (Object.keys(fields).length > 0) {
    return {
      ok: false,
      fields,
      error:
        'Ada beberapa data yang belum lengkap/valid — cek lagi ya, sudah kami tandain di atas.',
    }
  }

  return {
    ok: true,
    data: { nama, email, whatsapp, platforms, usernames },
  }
}

export async function submitAffiliateLead(
  body: unknown,
): Promise<AffiliateSubmitResult> {
  const flags = await getPublicSiteFlags()
  if (!flags.affiliateEnabled) {
    return {
      ok: false,
      error: 'Program affiliate sedang ditutup.',
      fields: {},
    }
  }
  const parsed = validateAffiliateLead(body)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, fields: parsed.fields }
  }

  try {
    await db.insert(affiliateLeads).values({
      nama: parsed.data.nama,
      email: parsed.data.email,
      whatsapp: parsed.data.whatsapp,
      platforms: parsed.data.platforms,
      usernames: { ...parsed.data.usernames },
    })
  } catch {
    return {
      ok: false,
      error:
        'Gagal menyimpan pendaftaran. Coba lagi sebentar ya. Kalau masih gagal, hubungi kami lewat halaman Kontak.',
      fields: {},
    }
  }

  return { ok: true }
}

export function whatsappHref(whatsapp: string) {
  let n = digits(whatsapp)
  if (n.startsWith('0')) n = `62${n.slice(1)}`
  else if (n.startsWith('8')) n = `62${n}`
  return `https://wa.me/${n}`
}

export type SerializedAffiliateLead = {
  status: AffiliateStatus
  referralUrl: string | null
  id: string
  nama: string
  email: string
  whatsapp: string
  whatsappUrl: string
  platforms: string[]
  usernames: Record<string, string>
  createdAt: number
}

const DEFAULT_PAGE_SIZE = 20

function searchNeedle(q?: string) {
  return (q ?? '').trim().toLowerCase().replace(/[%_]/g, '')
}

function serializeLead(row: {
  status: AffiliateStatus
  referralUrl: string | null
  id: string
  nama: string
  email: string
  whatsapp: string
  platforms: string[]
  usernames: Record<string, string>
  createdAt: Date | number
}): SerializedAffiliateLead {
  return {
    id: row.id,
    status: row.status,
    referralUrl: row.referralUrl,
    nama: row.nama,
    email: row.email,
    whatsapp: row.whatsapp,
    whatsappUrl: whatsappHref(row.whatsapp),
    platforms: row.platforms,
    usernames: row.usernames ?? {},
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.getTime()
        : Number(row.createdAt),
  }
}

function leadSearchWhere(q?: string) {
  const needle = searchNeedle(q)
  if (!needle) return undefined
  const pattern = `%${needle}%`
  return or(
    sql`lower(${affiliateLeads.nama}) like ${pattern}`,
    sql`lower(${affiliateLeads.email}) like ${pattern}`,
    sql`lower(${affiliateLeads.whatsapp}) like ${pattern}`,
  )
}

export async function listAffiliateLeads(input?: {
  status?: AffiliateStatus
  q?: string
  page?: number
  pageSize?: number
}) {
  const pageSize = Math.min(
    Math.max(input?.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    100,
  )
  const page = Math.max(input?.page ?? 1, 1)
  const where = and(
    leadSearchWhere(input?.q),
    input?.status ? eq(affiliateLeads.status, input.status) : undefined,
  )

  const [totalRow] = await db
    .select({ total: count() })
    .from(affiliateLeads)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, pageCount)

  if (total === 0) {
    return { leads: [], total: 0, page: 1, pageSize, pageCount: 1 }
  }

  const rows = await db.query.affiliateLeads.findMany({
    where,
    orderBy: [desc(affiliateLeads.createdAt), desc(affiliateLeads.id)],
    limit: pageSize,
    offset: (safePage - 1) * pageSize,
  })

  return {
    leads: rows.map(serializeLead),
    total,
    page: safePage,
    pageSize,
    pageCount,
  }
}

export async function getAffiliateLead(id: string) {
  const row = await db.query.affiliateLeads.findFirst({
    where: eq(affiliateLeads.id, id),
  })
  return row ? serializeLead(row) : null
}

export async function updateAffiliateLead(id: string, body: unknown) {
  const existing = await getAffiliateLead(id)
  if (!existing) {
    return {
      ok: false as const,
      error: 'Pendaftar tidak ditemukan.',
      fields: {} as AffiliateFieldErrors,
    }
  }

  const parsed = validateAffiliateLead(body)
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error, fields: parsed.fields }
  }

  await db
    .update(affiliateLeads)
    .set({
      nama: parsed.data.nama,
      email: parsed.data.email,
      whatsapp: parsed.data.whatsapp,
      platforms: parsed.data.platforms,
      usernames: { ...parsed.data.usernames },
    })
    .where(eq(affiliateLeads.id, id))

  return { ok: true as const }
}

export async function reviewAffiliateLead(
  id: string,
  status: AffiliateStatus,
  referralUrl: string | null,
) {
  const [updated] = await db
    .update(affiliateLeads)
    .set({ status, referralUrl: status === 'approved' ? referralUrl : null })
    .where(eq(affiliateLeads.id, id))
    .returning({ id: affiliateLeads.id })
  if (!updated) throw new Error('Pendaftar tidak ditemukan.')
}

export async function deleteAffiliateLead(id: string) {
  const deleted = await db
    .delete(affiliateLeads)
    .where(eq(affiliateLeads.id, id))
    .returning({ id: affiliateLeads.id })
  return { ok: deleted.length > 0 }
}
