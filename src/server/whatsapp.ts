import { and, asc, count, eq, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  reviewFeedbacks,
  whatsappCommands,
  whatsappGatewayState,
  whatsappOutbox,
} from '#/db/schema'
import { getDeployTarget } from '#/lib/deploy-target'
import { getAppUrl, getWhatsappGatewayToken, isProduction, isWhatsappGatewayConfigured } from '#/lib/env'
import {
  applyFeedbackDelivery,
  claimFeedbackJob,
  normalizeWhatsapp,
} from '#/server/review'

type GatewayStatus = 'OFFLINE' | 'CONNECTING' | 'QR' | 'OPEN' | 'LOGGED_OUT'
type GatewayCommand = 'CONNECT' | 'RECONNECT' | 'LOGOUT'

export const whatsappPollSchema = z.object({
  workerId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  connected: z.boolean(),
})

export const whatsappReportSchema = z.object({
  workerId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  status: z.enum(['OFFLINE', 'CONNECTING', 'QR', 'OPEN', 'LOGGED_OUT']),
  qr: z.string().max(4096).nullable().optional(),
  error: z.string().max(500).nullable().optional(),
  command: z
    .object({
      id: z.string().uuid(),
      status: z.enum(['ACKNOWLEDGED', 'FAILED']),
      error: z.string().max(500).nullable().optional(),
    })
    .optional(),
  job: z
    .object({
      id: z.string().uuid(),
      status: z.enum(['SUBMITTED', 'DELIVERED', 'FAILED', 'UNCERTAIN']),
      messageId: z.string().max(200).nullable().optional(),
      error: z.string().max(500).nullable().optional(),
    })
    .optional(),
})

function gatewayToken() {
  return getWhatsappGatewayToken()
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return mismatch === 0
}

export function isGatewayAuthorized(request: Request) {
  // Cloudflare injects bindings per request; touching the DB proxy hydrates
  // process.env before reading the gateway secret.
  try {
    void db.query.whatsappGatewayState
  } catch {
    return false
  }
  if (isProduction() && !isWhatsappGatewayConfigured()) return false
  const value = request.headers.get('authorization') ?? ''
  const token = value.startsWith('Bearer ') ? value.slice(7).trim() : ''
  return token.length > 0 && constantTimeEqual(token, gatewayToken())
}

async function assertWorker(workerId: string) {
  const now = new Date()
  const state = await db.query.whatsappGatewayState.findFirst({
    where: eq(whatsappGatewayState.id, 'primary'),
  })
  if (
    state?.workerId &&
    state.workerId !== workerId &&
    state.lastHeartbeatAt &&
    state.lastHeartbeatAt.getTime() > now.getTime() - 45_000
  ) {
    throw new Error('Gateway worker lain masih aktif.')
  }
  return now
}

async function touchGateway(input: {
  workerId: string
  status?: GatewayStatus
  qr?: string | null
  lastError?: string | null
}) {
  const now = new Date()
  await db
    .insert(whatsappGatewayState)
    .values({
      id: 'primary',
      workerId: input.workerId,
      status: input.status ?? 'OFFLINE',
      qr: input.qr?.slice(0, 4096) ?? null,
      lastHeartbeatAt: now,
      updatedAt: now,
      lastError: input.lastError?.slice(0, 500) ?? null,
    })
    .onConflictDoUpdate({
      target: whatsappGatewayState.id,
      set: {
        workerId: input.workerId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.qr !== undefined ? { qr: input.qr?.slice(0, 4096) ?? null } : {}),
        lastHeartbeatAt: now,
        updatedAt: now,
        lastError: input.lastError?.slice(0, 500) ?? null,
      },
    })
}

export async function pollWhatsappGateway(input: {
  workerId: string
  connected: boolean
}) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.workerId)) {
    throw new Error('Worker ID tidak valid.')
  }
  await assertWorker(input.workerId)
  await touchGateway({ workerId: input.workerId })

  const command = await db.query.whatsappCommands.findFirst({
    where: eq(whatsappCommands.status, 'PENDING'),
    orderBy: [asc(whatsappCommands.createdAt)],
  })
  const job = input.connected
    ? (await claimOutboxJob()) ?? (await claimFeedbackJob())
    : null
  return {
    command: command
      ? { id: command.id, command: command.command }
      : null,
    job: job
      ? {
          id: job.id,
          to: 'ownerWhatsapp' in job ? job.ownerWhatsapp : job.to,
          message: job.message,
          attempts: job.attempts,
        }
      : null,
  }
}

export async function reportWhatsappGateway(input: {
  workerId: string
  status: GatewayStatus
  qr?: string | null
  error?: string | null
  command?: {
    id: string
    status: 'ACKNOWLEDGED' | 'FAILED'
    error?: string | null
  }
  job?: {
    id: string
    status: 'SUBMITTED' | 'DELIVERED' | 'FAILED' | 'UNCERTAIN'
    messageId?: string | null
    error?: string | null
  }
}) {
  await assertWorker(input.workerId)
  await touchGateway({
    workerId: input.workerId,
    status: input.status,
    qr: input.status === 'QR' ? input.qr : null,
    lastError: input.error,
  })
  if (input.command) {
    await db
      .update(whatsappCommands)
      .set({
        status: input.command.status,
        error: input.command.error?.slice(0, 500) ?? null,
        acknowledgedAt: new Date(),
      })
      .where(eq(whatsappCommands.id, input.command.id))
  }
  if (input.job) {
    const outbox = await applyOutboxDelivery(input.job)
    if (!outbox) await applyFeedbackDelivery(input.job)
  }
  return { ok: true }
}

export async function isWhatsappGatewayOpen() {
  const state = await db.query.whatsappGatewayState.findFirst({
    where: eq(whatsappGatewayState.id, 'primary'),
  })
  const heartbeat = state?.lastHeartbeatAt?.getTime() ?? 0
  return (
    state?.status === 'OPEN' && heartbeat > Date.now() - 45_000
  )
}

export async function queueWhatsappOutbox(input: {
  to: string
  message: string
  kind?: 'OTP' | 'NOTICE' | 'TEST'
}) {
  const now = new Date()
  const [row] = await db
    .insert(whatsappOutbox)
    .values({
      to: input.to,
      message: input.message,
      kind: input.kind ?? 'OTP',
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: whatsappOutbox.id })
  if (!row) throw new Error('Pesan WhatsApp gagal masuk antrean.')
  return row
}

export async function testWhatsapp(toRaw: string) {
  if (!(await isWhatsappGatewayOpen())) {
    throw new Error(
      'WhatsApp belum OPEN. Lokal: npm run gateway:stub. Production: Hubungkan lalu scan QR.',
    )
  }
  const to = normalizeWhatsapp(toRaw)
  if (!to) throw new Error('Nomor WhatsApp tidak valid. Pakai 08… atau 628…')
  const queued = await queueWhatsappOutbox({
    to,
    kind: 'TEST',
    message: `Tes WhatsApp Ternak Review. Gateway nyambung. Aplikasi: ${getAppUrl()}`,
  })
  const status = await getWhatsappGatewayStatus()
  return {
    id: queued.id,
    to,
    testMode: status.testMode,
  }
}

async function claimOutboxJob(now = new Date()) {
  const leaseUntil = new Date(now.getTime() + 120_000)
  const candidate = await db.query.whatsappOutbox.findFirst({
    where: or(
      eq(whatsappOutbox.status, 'QUEUED'),
      and(
        eq(whatsappOutbox.status, 'PROCESSING'),
        lt(whatsappOutbox.leaseUntil, now),
      ),
    ),
    orderBy: [whatsappOutbox.createdAt],
  })
  if (!candidate) return null
  const [claimed] = await db
    .update(whatsappOutbox)
    .set({
      status: 'PROCESSING',
      leaseUntil,
      attempts: candidate.attempts + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(whatsappOutbox.id, candidate.id),
        or(
          eq(whatsappOutbox.status, 'QUEUED'),
          and(
            eq(whatsappOutbox.status, 'PROCESSING'),
            lt(whatsappOutbox.leaseUntil, now),
          ),
        ),
      ),
    )
    .returning()
  return claimed ?? null
}

async function applyOutboxDelivery(input: {
  id: string
  status: 'SUBMITTED' | 'DELIVERED' | 'FAILED' | 'UNCERTAIN'
  messageId?: string | null
  error?: string | null
}) {
  const now = new Date()
  const [row] = await db
    .update(whatsappOutbox)
    .set({
      status: input.status,
      gatewayMessageId: input.messageId ?? undefined,
      deliveryError: input.error?.slice(0, 500) ?? null,
      leaseUntil: null,
      updatedAt: now,
      submittedAt: input.status === 'SUBMITTED' ? now : undefined,
      deliveredAt: input.status === 'DELIVERED' ? now : undefined,
    })
    .where(eq(whatsappOutbox.id, input.id))
    .returning({ id: whatsappOutbox.id })
  return Boolean(row)
}

export async function getWhatsappGatewayStatus() {
  const state = await db.query.whatsappGatewayState.findFirst({
    where: eq(whatsappGatewayState.id, 'primary'),
  })
  const pendingWhere = or(
    eq(reviewFeedbacks.status, 'QUEUED'),
    eq(reviewFeedbacks.status, 'PROCESSING'),
    eq(reviewFeedbacks.status, 'UNCERTAIN'),
  )
  const outboxPendingWhere = or(
    eq(whatsappOutbox.status, 'QUEUED'),
    eq(whatsappOutbox.status, 'PROCESSING'),
    eq(whatsappOutbox.status, 'UNCERTAIN'),
  )
  const [pendingFeedback] = await db
    .select({ total: count() })
    .from(reviewFeedbacks)
    .where(pendingWhere)
  const [pendingOutbox] = await db
    .select({ total: count() })
    .from(whatsappOutbox)
    .where(outboxPendingWhere)
  const now = Date.now()
  const heartbeat = state?.lastHeartbeatAt?.getTime() ?? 0
  const isOnline = heartbeat > now - 45_000
  const qrFresh =
    state?.status === 'QR' && state.updatedAt.getTime() > now - 60_000
  const workerId = state?.workerId ?? null
  return {
    status: isOnline ? state?.status ?? 'OFFLINE' : 'OFFLINE',
    workerId,
    testMode: Boolean(workerId?.startsWith('stub')),
    cloudflare: getDeployTarget() === 'cloudflare',
    qr: qrFresh ? state?.qr ?? null : null,
    lastHeartbeatAt: state?.lastHeartbeatAt?.getTime() ?? null,
    lastError: state?.lastError ?? null,
    pending: Number(pendingFeedback?.total ?? 0) + Number(pendingOutbox?.total ?? 0),
  }
}

export async function queueWhatsappCommand(command: GatewayCommand) {
  const [row] = await db
    .insert(whatsappCommands)
    .values({ command })
    .returning({ id: whatsappCommands.id, command: whatsappCommands.command })
  return row ?? { id: '', command }
}

export function gatewayError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}
