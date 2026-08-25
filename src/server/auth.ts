import {
  getRequestHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { and, count, eq, gt } from 'drizzle-orm'
import { db } from '#/db'
import { owners, sessions } from '#/db/schema'
import {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '#/lib/crypto'
import { getAppUrl } from '#/lib/env'

const SESSION_COOKIE = 'review_session'
const SESSION_DAYS = 30

function cookieFlags(maxAge: number) {
  const secure =
    process.env.NODE_ENV === 'production' ||
    getAppUrl().startsWith('https://')
  return [
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

export function setSessionCookie(token: string) {
  try {
    setResponseHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; ${cookieFlags(SESSION_DAYS * 24 * 60 * 60)}`,
    )
  } catch {
    // Outside HTTP request context
  }
}

export function clearSessionCookie() {
  try {
    setResponseHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; ${cookieFlags(0)}`,
    )
  } catch {
    // Outside HTTP request context
  }
}

export function readSessionToken(): string | null {
  try {
    const header = getRequestHeader('cookie')
    if (!header) return null
    for (const part of header.split(/;\s*/)) {
      const eqIdx = part.indexOf('=')
      if (eqIdx === -1) continue
      if (part.slice(0, eqIdx) === SESSION_COOKIE) {
        return decodeURIComponent(part.slice(eqIdx + 1))
      }
    }
    return null
  } catch {
    // Outside HTTP request context (scripts/tests)
    return null
  }
}

export type SessionOwner = {
  sessionId: string
  ownerId: string
  email: string
  hasPassword: boolean
}

export async function getSessionOwner(): Promise<SessionOwner | null> {
  const token = readSessionToken()
  if (!token) return null
  const tokenHash = hashToken(token)
  const row = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.tokenHash, tokenHash),
      gt(sessions.expiresAt, new Date()),
    ),
    with: { owner: true },
  })
  if (!row?.owner) return null
  return {
    sessionId: row.id,
    ownerId: row.owner.id,
    email: row.owner.email,
    hasPassword: Boolean(row.owner.passwordHash),
  }
}

const GENERIC_LOGIN_ERROR = 'Email atau password salah'

export async function loginWithPassword(email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const owner = await db.query.owners.findFirst({
    where: eq(owners.email, normalized),
  })
  if (
    !owner?.passwordHash ||
    !(await verifyPassword(password, owner.passwordHash))
  ) {
    throw new Error(GENERIC_LOGIN_ERROR)
  }
  await createSessionForOwner(owner.id)
  return { ownerId: owner.id, email: owner.email }
}

export async function adminExists() {
  const [row] = await db.select({ n: count() }).from(owners)
  return Number(row?.n ?? 0) > 0
}

export async function registerWithPassword(email: string, password: string) {
  if (await adminExists()) {
    throw new Error('Pendaftaran tertutup. Hanya admin yang bisa masuk.')
  }
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) {
    throw new Error('Email tidak valid')
  }
  if (password.length < 8) {
    throw new Error('Password minimal 8 karakter')
  }

  const [created] = await db
    .insert(owners)
    .values({
      email: normalized,
      passwordHash: await hashPassword(password),
    })
    .returning()
  await createSessionForOwner(created.id)
  return { ownerId: created.id, email: created.email }
}

export async function changeOwnerPassword(
  ownerId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < 8) {
    throw new Error('Password baru minimal 8 karakter')
  }
  const owner = await db.query.owners.findFirst({
    where: eq(owners.id, ownerId),
  })
  if (
    !owner?.passwordHash ||
    !(await verifyPassword(currentPassword, owner.passwordHash))
  ) {
    throw new Error('Password sekarang salah')
  }
  await db
    .update(owners)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(owners.id, ownerId))
  return { ok: true as const }
}

export async function createSessionForOwner(ownerId: string) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({
    ownerId,
    tokenHash: hashToken(token),
    expiresAt,
  })
  setSessionCookie(token)
  return token
}

export async function destroyCurrentSession() {
  const token = readSessionToken()
  if (token) {
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)))
      .catch(() => {})
  }
  clearSessionCookie()
}
