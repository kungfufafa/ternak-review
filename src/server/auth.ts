import {
  getRequestHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { and, count, eq, gt, lt } from 'drizzle-orm'
import { db } from '#/db'
import { owners, sessions } from '#/db/schema'
import {
  generateToken,
  hashPassword,
  hashToken,
  passwordHashNeedsUpgrade,
  pbkdf2Iterations,
  timingSafeEqualText,
  verifyPassword,
} from '#/lib/crypto'
import { getAdminSetupToken, getAppUrl, isProduction } from '#/lib/env'

const DEV_SESSION_COOKIE = 'review_session'
const PROD_SESSION_COOKIE = '__Host-review_session'
const SESSION_HOURS = 12
const MIN_PASSWORD_LENGTH = 6
const PRIMARY_OWNER_ID = '00000000-0000-4000-8000-000000000001'
const DUMMY_SALT_HASH =
  'c0dec0dec0dec0dec0dec0dec0dec0de:359a83837843ace257b2cf995e64abb23327222ca6745852f7ebd588016d405b'

function dummyPasswordHash() {
  return `pbkdf2:${pbkdf2Iterations()}:${DUMMY_SALT_HASH}`
}

function sessionCookieName() {
  return isProduction() ? PROD_SESSION_COOKIE : DEV_SESSION_COOKIE
}

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
      `${sessionCookieName()}=${token}; ${cookieFlags(SESSION_HOURS * 60 * 60)}`,
    )
  } catch {
    // Outside HTTP request context
  }
}

export function clearSessionCookie() {
  try {
    setResponseHeader(
      'Set-Cookie',
      `${sessionCookieName()}=; ${cookieFlags(0)}`,
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
      if (part.slice(0, eqIdx) === sessionCookieName()) {
        return decodeURIComponent(part.slice(eqIdx + 1))
      }
    }
    return null
  } catch {
    // Outside HTTP request context (scripts/tests)
    return null
  }
}

export type OwnerRole = 'ADMIN' | 'USER'
export type OwnerStatus = 'ACTIVE' | 'DISABLED'

export type SessionOwner = {
  sessionId: string
  ownerId: string
  email: string
  name: string | null
  role: OwnerRole
  status: OwnerStatus
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
  if (row.owner.status !== 'ACTIVE') return null
  return {
    sessionId: row.id,
    ownerId: row.owner.id,
    email: row.owner.email,
    name: row.owner.name,
    role: row.owner.role,
    status: row.owner.status,
    hasPassword: Boolean(row.owner.passwordHash),
  }
}

const GENERIC_LOGIN_ERROR = 'Email atau password salah'

export async function loginWithPassword(email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const owner = await db.query.owners.findFirst({
    where: eq(owners.email, normalized),
  })
  const hashToVerify = owner?.passwordHash ?? dummyPasswordHash()
  const passwordMatches = await verifyPassword(password, hashToVerify)
  if (!owner?.passwordHash || !passwordMatches) {
    throw new Error(GENERIC_LOGIN_ERROR)
  }
  if (owner.status !== 'ACTIVE') {
    throw new Error('Akun dinonaktifkan.')
  }
  if (passwordHashNeedsUpgrade(owner.passwordHash)) {
    await db
      .update(owners)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(owners.id, owner.id))
  }
  await replaceSessionsForOwner(owner.id)
  return {
    ownerId: owner.id,
    email: owner.email,
    role: owner.role as OwnerRole,
  }
}

export async function adminExists() {
  const [row] = await db
    .select({ n: count() })
    .from(owners)
    .where(eq(owners.role, 'ADMIN'))
  return Number(row?.n ?? 0) > 0
}

export async function registerWithPassword(
  email: string,
  password: string,
  setupToken: string,
) {
  if (await adminExists()) {
    throw new Error('Pendaftaran tertutup. Hanya admin yang bisa masuk.')
  }
  if (!timingSafeEqualText(setupToken, getAdminSetupToken())) {
    throw new Error('Token setup admin salah.')
  }
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) {
    throw new Error('Email tidak valid')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter`)
  }

  let created: typeof owners.$inferSelect | undefined
  try {
    const inserted = await db
      .insert(owners)
      .values({
        id: PRIMARY_OWNER_ID,
        email: normalized,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
        status: 'ACTIVE',
      })
      .returning()
    created = inserted[0]
  } catch (error) {
    if (await adminExists()) {
      throw new Error('Pendaftaran tertutup. Hanya admin yang bisa masuk.')
    }
    throw error
  }
  if (!created) throw new Error('Gagal membuat admin')
  await createSessionForOwner(created.id)
  return { ownerId: created.id, email: created.email, role: 'ADMIN' as const }
}

export async function changeOwnerPassword(
  ownerId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password baru minimal ${MIN_PASSWORD_LENGTH} karakter`)
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
  await replaceSessionsForOwner(ownerId)
  return { ok: true as const }
}

export async function replaceHolderSessions(ownerId: string) {
  await db.delete(sessions).where(eq(sessions.ownerId, ownerId))
}

export async function createSessionForOwner(ownerId: string) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
  await db.insert(sessions).values({
    ownerId,
    tokenHash: hashToken(token),
    expiresAt,
  })
  setSessionCookie(token)
  return token
}

export async function replaceSessionsForOwner(ownerId: string) {
  await db.delete(sessions).where(eq(sessions.ownerId, ownerId))
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  return createSessionForOwner(ownerId)
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
