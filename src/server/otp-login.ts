import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { emailOtps, loginOtps, owners } from '#/db/schema'
import { hashToken, timingSafeEqualText } from '#/lib/crypto'
import { normalizeWhatsapp } from '#/server/review'
import { createSessionForOwner, type OwnerRole } from './auth'
import { isSmtpReady, sendAppEmail } from './smtp'
import { isWhatsappGatewayOpen, queueWhatsappOutbox } from './whatsapp'

const OTP_TTL_MS = 5 * 60_000
const OTP_MAX_ATTEMPTS = 5
const GENERIC_SENT =
  'Kalau nomor itu terdaftar, kodenya dikirim ke WhatsApp.'

function hashOtp(code: string) {
  return hashToken(`login-otp:${code}`)
}

function generateOtp() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    const code = String(100000 + (value % 900000))
    if (code !== '123456' && code !== '000000') return code
  }
  return '482193'
}

export async function requestLoginOtp(whatsappRaw: string) {
  if (!(await isWhatsappGatewayOpen())) {
    throw new Error(
      'WhatsApp belum aktif. Masuk pakai email, atau minta admin menyalakan gateway.',
    )
  }
  const whatsapp = normalizeWhatsapp(whatsappRaw)
  if (!whatsapp) {
    throw new Error('Nomor WhatsApp tidak valid.')
  }
  const owner = await db.query.owners.findFirst({
    where: and(
      eq(owners.whatsapp, whatsapp),
      eq(owners.role, 'USER'),
      eq(owners.status, 'ACTIVE'),
    ),
  })
  if (!owner) return { ok: true as const, sent: GENERIC_SENT }

  const code = generateOtp()
  const now = new Date()
  await db
    .update(loginOtps)
    .set({ consumedAt: now })
    .where(
      and(eq(loginOtps.ownerId, owner.id), isNull(loginOtps.consumedAt)),
    )
  await db.insert(loginOtps).values({
    ownerId: owner.id,
    whatsapp,
    codeHash: hashOtp(code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    createdAt: now,
  })
  await queueWhatsappOutbox({
    to: whatsapp,
    kind: 'OTP',
    message: `Kode masuk Ternak Review: ${code}. Berlaku 5 menit. Jangan bagikan ke siapa pun.`,
  })
  return { ok: true as const, sent: GENERIC_SENT }
}

export async function verifyLoginOtp(whatsappRaw: string, codeRaw: string) {
  if (!(await isWhatsappGatewayOpen())) {
    throw new Error(
      'WhatsApp belum aktif. Masuk pakai email, atau minta admin menyalakan gateway.',
    )
  }
  const whatsapp = normalizeWhatsapp(whatsappRaw)
  const code = codeRaw.trim()
  if (!whatsapp || !/^\d{6}$/.test(code)) {
    throw new Error('Nomor atau kode tidak valid.')
  }
  const owner = await db.query.owners.findFirst({
    where: and(
      eq(owners.whatsapp, whatsapp),
      eq(owners.role, 'USER'),
      eq(owners.status, 'ACTIVE'),
    ),
  })
  const otp = owner
    ? await db.query.loginOtps.findFirst({
        where: and(
          eq(loginOtps.ownerId, owner.id),
          eq(loginOtps.whatsapp, whatsapp),
          isNull(loginOtps.consumedAt),
        ),
        orderBy: [desc(loginOtps.createdAt)],
      })
    : null
  if (!owner || !otp || otp.expiresAt.getTime() <= Date.now()) {
    throw new Error('Kode tidak berlaku. Minta kode baru.')
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db
      .update(loginOtps)
      .set({ consumedAt: new Date() })
      .where(eq(loginOtps.id, otp.id))
    throw new Error('Terlalu banyak percobaan. Minta kode baru.')
  }
  if (!timingSafeEqualText(hashOtp(code), otp.codeHash)) {
    await db
      .update(loginOtps)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(loginOtps.id, otp.id))
    throw new Error('Kode belum cocok.')
  }
  await db
    .update(loginOtps)
    .set({ consumedAt: new Date() })
    .where(eq(loginOtps.id, otp.id))
  await createSessionForOwner(owner.id)
  return {
    ownerId: owner.id,
    email: owner.email,
    role: 'USER' as const,
  }
}

const GENERIC_EMAIL_SENT =
  'Kalau email itu terdaftar, kodenya dikirim ke kotak masuk.'

const MAIL_OFF_ERROR =
  'Pengiriman email belum aktif. Masuk pakai password, atau minta admin mengisi Resend/SMTP.'

async function findActiveOwnerByEmail(email: string) {
  return db.query.owners.findFirst({
    where: and(eq(owners.email, email), eq(owners.status, 'ACTIVE')),
  })
}

function sessionRole(role: string): OwnerRole {
  return role === 'ADMIN' ? 'ADMIN' : 'USER'
}

export async function requestEmailLoginOtp(emailRaw: string) {
  if (!(await isSmtpReady())) {
    throw new Error(MAIL_OFF_ERROR)
  }
  const email = emailRaw.trim().toLowerCase()
  if (!email.includes('@') || email.endsWith('@wa.holder')) {
    throw new Error('Email tidak valid.')
  }
  const owner = await findActiveOwnerByEmail(email)
  if (!owner) return { ok: true as const, sent: GENERIC_EMAIL_SENT }

  const code = generateOtp()
  const now = new Date()
  await db
    .update(emailOtps)
    .set({ consumedAt: now })
    .where(and(eq(emailOtps.ownerId, owner.id), isNull(emailOtps.consumedAt)))
  await db.insert(emailOtps).values({
    ownerId: owner.id,
    email,
    codeHash: hashOtp(code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    createdAt: now,
  })
  await sendAppEmail({
    to: email,
    subject: 'Kode masuk Ternak Review',
    text: `Kode masuk Ternak Review: ${code}. Berlaku 5 menit. Jangan bagikan ke siapa pun.`,
    kind: 'OTP',
  })
  return { ok: true as const, sent: GENERIC_EMAIL_SENT }
}

export async function verifyEmailLoginOtp(emailRaw: string, codeRaw: string) {
  if (!(await isSmtpReady())) {
    throw new Error(MAIL_OFF_ERROR)
  }
  const email = emailRaw.trim().toLowerCase()
  const code = codeRaw.trim()
  if (!email.includes('@') || !/^\d{6}$/.test(code)) {
    throw new Error('Email atau kode tidak valid.')
  }
  const owner = await findActiveOwnerByEmail(email)
  const otp = owner
    ? await db.query.emailOtps.findFirst({
        where: and(
          eq(emailOtps.ownerId, owner.id),
          eq(emailOtps.email, email),
          isNull(emailOtps.consumedAt),
        ),
        orderBy: [desc(emailOtps.createdAt)],
      })
    : null
  if (!owner || !otp || otp.expiresAt.getTime() <= Date.now()) {
    throw new Error('Kode tidak berlaku. Minta kode baru.')
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db
      .update(emailOtps)
      .set({ consumedAt: new Date() })
      .where(eq(emailOtps.id, otp.id))
    throw new Error('Terlalu banyak percobaan. Minta kode baru.')
  }
  if (!timingSafeEqualText(hashOtp(code), otp.codeHash)) {
    await db
      .update(emailOtps)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(emailOtps.id, otp.id))
    throw new Error('Kode belum cocok.')
  }
  await db
    .update(emailOtps)
    .set({ consumedAt: new Date() })
    .where(eq(emailOtps.id, otp.id))
  await createSessionForOwner(owner.id)
  return {
    ownerId: owner.id,
    email: owner.email,
    role: sessionRole(owner.role),
  }
}
