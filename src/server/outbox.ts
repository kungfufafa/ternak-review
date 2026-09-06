import { count, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { emailOutbox, reviewFeedbacks, whatsappOutbox } from '#/db/schema'
import { getSmtpPublicSettings, isSmtpReady } from '#/server/smtp'
import {
  getWhatsappGatewayStatus,
  isWhatsappGatewayOpen,
} from '#/server/whatsapp'

export type OutboundChannel = 'email' | 'whatsapp'
export type OutboundLogItem = {
  id: string
  channel: OutboundChannel
  kind: string
  to: string
  title: string
  preview: string
  status: string
  error: string | null
  createdAt: number
}

function previewOf(value: string) {
  return value
    .replace(/\b\d{6}\b/g, '••••••')
    .replace(/PIN(?: aktivasi(?: kartumu)?)?: \d{4}/gi, 'PIN: ••••')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function asTime(value: Date | number | null | undefined) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return 0
}

export async function listOutboundLogs(input?: {
  channel?: OutboundChannel
  page?: number
  pageSize?: number
}) {
  const pageSize = Math.min(Math.max(input?.pageSize ?? 30, 1), 100)
  const page = Math.max(input?.page ?? 1, 1)
  const channel = input?.channel

  const [emails, outbox, feedback] = await Promise.all([
    channel === 'whatsapp'
      ? Promise.resolve([])
      : db.query.emailOutbox.findMany({
          orderBy: [desc(emailOutbox.createdAt)],
          limit: 400,
        }),
    channel === 'email'
      ? Promise.resolve([])
      : db.query.whatsappOutbox.findMany({
          orderBy: [desc(whatsappOutbox.createdAt)],
          limit: 400,
        }),
    channel === 'email'
      ? Promise.resolve([])
      : db.query.reviewFeedbacks.findMany({
          orderBy: [desc(reviewFeedbacks.createdAt)],
          limit: 400,
        }),
  ])

  const items: OutboundLogItem[] = [
    ...emails.map((row) => ({
      id: row.id,
      channel: 'email' as const,
      kind: row.kind,
      to: row.to,
      title: row.subject,
      preview: previewOf(row.body),
      status: row.status,
      error: row.deliveryError,
      createdAt: asTime(row.createdAt),
    })),
    ...outbox.map((row) => ({
      id: row.id,
      channel: 'whatsapp' as const,
      kind: row.kind,
      to: row.to,
      title:
        row.kind === 'OTP'
          ? 'OTP masuk'
          : row.kind === 'TEST'
            ? 'Tes kirim'
            : 'Pesan WhatsApp',
      preview: previewOf(row.message),
      status: row.status,
      error: row.deliveryError,
      createdAt: asTime(row.createdAt),
    })),
    ...feedback.map((row) => ({
      id: row.id,
      channel: 'whatsapp' as const,
      kind: 'FEEDBACK',
      to: row.ownerWhatsapp,
      title: `Feedback ${row.rating} bintang`,
      preview: previewOf(row.message),
      status: row.status,
      error: row.deliveryError,
      createdAt: asTime(row.createdAt),
    })),
  ].sort((left, right) => right.createdAt - left.createdAt)

  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: total === 0 ? 1 : safePage,
    pageSize,
    pageCount,
  }
}

export async function getOutboundLogSummary() {
  const [
    emailTotal,
    emailFailed,
    emailSent,
    waTotal,
    waFailed,
    waQueued,
    feedbackTotal,
    feedbackFailed,
    feedbackQueued,
    smtp,
    whatsapp,
    emailReady,
    whatsappOpen,
  ] = await Promise.all([
    db.select({ n: count() }).from(emailOutbox).then((rows) => Number(rows[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, 'FAILED'))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, 'SENT'))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    db.select({ n: count() }).from(whatsappOutbox).then((rows) => Number(rows[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(whatsappOutbox)
      .where(eq(whatsappOutbox.status, 'FAILED'))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(whatsappOutbox)
      .where(eq(whatsappOutbox.status, 'QUEUED'))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    db.select({ n: count() }).from(reviewFeedbacks).then((rows) => Number(rows[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(reviewFeedbacks)
      .where(eq(reviewFeedbacks.status, 'FAILED'))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(reviewFeedbacks)
      .where(eq(reviewFeedbacks.status, 'QUEUED'))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    getSmtpPublicSettings(),
    getWhatsappGatewayStatus(),
    isSmtpReady(),
    isWhatsappGatewayOpen(),
  ])

  return {
    email: {
      ready: emailReady,
      provider: smtp.provider,
      total: emailTotal,
      sent: emailSent,
      failed: emailFailed,
    },
    whatsapp: {
      open: whatsappOpen,
      status: whatsapp.status,
      total: waTotal + feedbackTotal,
      queued: waQueued + feedbackQueued,
      failed: waFailed + feedbackFailed,
    },
  }
}
