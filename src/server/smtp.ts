import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { emailOutbox, smtpSettings } from '#/db/schema'
import { decryptSecret, encryptSecret } from '#/lib/crypto'
import { getAppUrl } from '#/lib/env'

const PRIMARY = 'primary'
export type MailProvider = 'smtp' | 'resend'

function deployTarget() {
  try {
    return String(import.meta.env?.DEPLOY_TARGET ?? 'local')
  } catch {
    return 'local'
  }
}

export function smtpSocketSupported() {
  return deployTarget() !== 'cloudflare'
}

export type SmtpPublicSettings = {
  provider: MailProvider
  host: string
  port: number
  secure: boolean
  username: string
  fromName: string
  fromEmail: string
  enabled: boolean
  hasPassword: boolean
  verifiedAt: number | null
  sendSupported: boolean
  smtpSocketSupported: boolean
}

async function loadRow() {
  return (
    (await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, PRIMARY),
    })) ?? null
  )
}

function providerOf(row: { provider?: string | null } | null): MailProvider {
  return row?.provider === 'resend' ? 'resend' : 'smtp'
}

export async function getSmtpPublicSettings(): Promise<SmtpPublicSettings> {
  const row = await loadRow()
  const provider = providerOf(row)
  const sockets = smtpSocketSupported()
  return {
    provider,
    host: row?.host ?? '',
    port: row?.port ?? 587,
    secure: Boolean(row?.secure),
    username: row?.username ?? '',
    fromName: row?.fromName ?? '',
    fromEmail: row?.fromEmail ?? '',
    enabled: Boolean(row?.enabled),
    hasPassword: Boolean(row?.passwordCipher),
    verifiedAt: row?.verifiedAt?.getTime() ?? null,
    sendSupported: provider === 'resend' || sockets,
    smtpSocketSupported: sockets,
  }
}

export async function isSmtpReady() {
  const row = await loadRow()
  if (!row?.enabled || !row.fromEmail.trim() || !row.passwordCipher) return false
  if (providerOf(row) === 'resend') return true
  return Boolean(row.host.trim()) && smtpSocketSupported()
}

export async function saveSmtpSettings(input: {
  provider?: MailProvider
  host: string
  port: number
  secure: boolean
  username?: string
  password?: string
  fromName?: string
  fromEmail: string
  enabled: boolean
}) {
  const provider: MailProvider = input.provider === 'resend' ? 'resend' : 'smtp'
  const host = provider === 'resend' ? 'smtp.resend.com' : input.host.trim()
  const fromEmail = input.fromEmail.trim()
  if (input.enabled && !fromEmail) {
    throw new Error('Email pengirim wajib diisi.')
  }
  if (provider === 'smtp' && input.enabled && !host) {
    throw new Error('Host SMTP wajib diisi.')
  }
  if (input.port < 1 || input.port > 65535) {
    throw new Error('Port SMTP tidak valid.')
  }
  const existing = await loadRow()
  if (
    input.enabled &&
    existing &&
    provider !== providerOf(existing) &&
    !input.password?.trim()
  ) {
    throw new Error(
      provider === 'resend' ? 'API key Resend wajib diisi.' : 'Password SMTP wajib diisi.',
    )
  }
  const passwordCipher = input.password?.trim()
    ? await encryptSecret(input.password.trim())
    : existing?.passwordCipher ?? null
  if (input.enabled && !passwordCipher) {
    throw new Error(
      provider === 'resend' ? 'API key Resend belum diisi.' : 'Password SMTP belum diisi.',
    )
  }
  const now = new Date()
  const values = {
    id: PRIMARY,
    provider,
    host,
    port: provider === 'resend' ? 465 : input.port,
    secure: provider === 'resend' ? true : input.secure,
    username: provider === 'resend' ? 'resend' : input.username?.trim() || null,
    passwordCipher,
    fromName: input.fromName?.trim() || null,
    fromEmail,
    enabled: input.enabled,
    verifiedAt: input.enabled ? existing?.verifiedAt ?? null : null,
    updatedAt: now,
  }
  await db.insert(smtpSettings).values(values).onConflictDoUpdate({
    target: smtpSettings.id,
    set: {
      provider: values.provider,
      host: values.host,
      port: values.port,
      secure: values.secure,
      username: values.username,
      passwordCipher: values.passwordCipher,
      fromName: values.fromName,
      fromEmail: values.fromEmail,
      enabled: values.enabled,
      verifiedAt: values.verifiedAt,
      updatedAt: now,
    },
  })
  return getSmtpPublicSettings()
}

function fromHeader(row: { fromName: string | null; fromEmail: string }) {
  return row.fromName ? `${row.fromName} <${row.fromEmail}>` : row.fromEmail
}

function describeResendError(message: string | undefined, from: string) {
  const raw = (message ?? '').trim()
  const lower = raw.toLowerCase()
  if (
    lower.includes('not verified') ||
    lower.includes('associated domain') ||
    lower.includes('domain is not verified')
  ) {
    return [
      'Resend menolak: domain pengirim belum verified, atau API key dikunci ke domain yang belum verified.',
      'Di resend.com/domains tambah domain, pasang DNS, tunggu status Verified.',
      'Buat API key baru (Sending access) untuk domain itu, tempel di sini.',
      `Email pengirim harus persis domain itu — sekarang: ${from}. Bukan Gmail/Yahoo.`,
    ].join(' ')
  }
  if (lower.includes('only send testing emails to your own')) {
    return 'Tanpa domain verified, Resend hanya kirim ke email akun Resend-mu sendiri. Verifikasi domain, atau isi tujuan tes dengan email akun itu.'
  }
  return raw || 'Resend menolak pengiriman. Cek API key dan domain pengirim.'
}

async function sendViaResend(input: {
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  })
  const body = (await response.json().catch(() => null)) as {
    id?: string
    message?: string
    name?: string
  } | null
  if (!response.ok) {
    throw new Error(describeResendError(body?.message, input.from))
  }
  return body?.id ?? null
}

async function sendViaSmtp(input: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  to: string
  subject: string
  text: string
}) {
  if (!smtpSocketSupported()) {
    throw new Error(
      'SMTP socket tidak jalan di Cloudflare. Pakai Resend (API key) atau deploy VPS.',
    )
  }
  const { default: nodemailer } = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.secure,
    auth: { user: input.user, pass: input.pass },
  })
  await transporter.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  })
}

export type EmailKind = 'OTP' | 'WELCOME' | 'TEST' | 'NOTICE'

export async function sendAppEmail(input: {
  to: string
  subject: string
  text: string
  kind?: EmailKind
}) {
  const row = await loadRow()
  if (!row?.fromEmail || !row.passwordCipher) {
    throw new Error('Pengiriman email belum dilengkapi.')
  }
  const secret = await decryptSecret(row.passwordCipher)
  const from = fromHeader(row)
  const provider = providerOf(row)
  const [log] = await db
    .insert(emailOutbox)
    .values({
      kind: input.kind ?? 'NOTICE',
      to: input.to,
      subject: input.subject,
      body: input.text.slice(0, 2000),
      provider,
      fromAddress: from,
      status: 'QUEUED',
    })
    .returning({ id: emailOutbox.id })
  if (!log) throw new Error('Log email gagal disimpan.')
  try {
    let providerMessageId: string | null = null
    if (provider === 'resend') {
      providerMessageId = await sendViaResend({
        apiKey: secret,
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      })
    } else {
      await sendViaSmtp({
        host: row.host,
        port: row.port,
        secure: Boolean(row.secure),
        user: row.username || row.fromEmail,
        pass: secret,
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      })
    }
    const now = new Date()
    await db
      .update(emailOutbox)
      .set({
        status: 'SENT',
        providerMessageId,
        sentAt: now,
        updatedAt: now,
      })
      .where(eq(emailOutbox.id, log.id))
  } catch (error) {
    const now = new Date()
    await db
      .update(emailOutbox)
      .set({
        status: 'FAILED',
        deliveryError:
          error instanceof Error ? error.message.slice(0, 500) : 'Gagal kirim',
        updatedAt: now,
      })
      .where(eq(emailOutbox.id, log.id))
    throw error
  }
}

export async function testSmtp(to: string) {
  const dest = to.trim()
  if (!dest.includes('@')) throw new Error('Email tujuan tes tidak valid.')
  await sendAppEmail({
    to: dest,
    subject: 'Tes email Ternak Review',
    text: `Pengiriman email sudah nyambung. Aplikasi: ${getAppUrl()}`,
    kind: 'TEST',
  })
  const now = new Date()
  await db
    .update(smtpSettings)
    .set({ verifiedAt: now, updatedAt: now, enabled: true })
    .where(eq(smtpSettings.id, PRIMARY))
  return getSmtpPublicSettings()
}


