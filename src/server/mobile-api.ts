import { z } from 'zod'
import { getSessionOwner, type SessionOwner } from '#/server/auth'

export const mobileCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}

export function mobileOptions() {
  return new Response(null, { status: 204, headers: mobileCorsHeaders })
}

export function mobileJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: mobileCorsHeaders })
}

export function mobileError(message: string, status = 400) {
  return mobileJson({ ok: false, error: message }, status)
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new Error('Body JSON tidak valid.')
  }
}

export async function requireMobileAdmin(): Promise<SessionOwner> {
  const owner = await getSessionOwner()
  if (!owner) throw new Error('UNAUTHORIZED')
  if (owner.role !== 'ADMIN') throw new Error('FORBIDDEN')
  return owner
}

export function mobileAuthError(error: unknown) {
  if (error instanceof z.ZodError) {
    return mobileError('Data tidak valid.', 400)
  }
  const message = error instanceof Error ? error.message : 'Gagal'
  if (message === 'UNAUTHORIZED') {
    return mobileError('Masuk dulu.', 401)
  }
  if (message === 'FORBIDDEN') {
    return mobileError('Hanya admin yang bisa nulis NFC dari app.', 403)
  }
  return mobileError(message, 400)
}

export const mobileLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(200),
})

export const mobileRefSchema = z.object({
  ref: z.string().trim().min(4).max(500),
})

export const mobileGenerateSchema = z.object({
  count: z.number().int().min(1).max(1000),
  label: z.string().trim().max(80).optional(),
})

export const mobileBatchIdSchema = z.object({
  batchId: z.string().uuid(),
})
