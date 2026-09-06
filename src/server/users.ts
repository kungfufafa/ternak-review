import { and, count, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import { owners, units } from '#/db/schema'
import { hashPassword } from '#/lib/crypto'
import { generatePin, hashPin, normalizePin } from '#/lib/pin'
import { replaceHolderSessions } from './auth'
import { normalizeWhatsapp } from './review'
import { sendHolderWelcomeEmail } from './smtp'

const MIN_PASSWORD_LENGTH = 6

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase()
  if (!value.includes('@')) throw new Error('Email tidak valid.')
  return value
}

function normalizeName(name?: string | null) {
  const value = name?.trim().replace(/\s+/g, ' ') ?? ''
  return value.length > 0 ? value.slice(0, 80) : null
}

export async function createHolder(input: {
  email?: string
  password?: string
  whatsapp?: string | null
  name?: string | null
  pin?: string
}) {
  const whatsapp = input.whatsapp?.trim()
    ? normalizeWhatsapp(input.whatsapp)
    : null
  if (input.whatsapp?.trim() && !whatsapp) {
    throw new Error('Nomor WhatsApp tidak valid.')
  }
  const emailInput = input.email?.trim() ?? ''
  const password = input.password ?? ''
  const hasPassword = password.length > 0
  if (hasPassword && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`)
  }
  if (!whatsapp && !(emailInput && hasPassword)) {
    throw new Error('Isi WhatsApp, atau email plus password.')
  }
  const email = emailInput
    ? normalizeEmail(emailInput)
    : `${whatsapp}@wa.holder`
  const pin = input.pin?.trim() ? normalizePin(input.pin) : generatePin()
  try {
    const [created] = await db
      .insert(owners)
      .values({
        email,
        name: normalizeName(input.name),
        passwordHash: hasPassword ? await hashPassword(password) : null,
        whatsapp,
        role: 'USER',
        status: 'ACTIVE',
        pinHash: hashPin(pin),
      })
      .returning({
        id: owners.id,
        email: owners.email,
        name: owners.name,
        whatsapp: owners.whatsapp,
        status: owners.status,
      })
    if (!created) throw new Error('Gagal membuat pengguna.')
    void sendHolderWelcomeEmail({
      to: created.email,
      name: created.name,
      pin,
    }).catch(() => {})
    return { ...created, pin }
  } catch (error) {
    const existingEmail = await db.query.owners.findFirst({
      where: eq(owners.email, email),
    })
    if (existingEmail) throw new Error('Email sudah terpakai.')
    if (whatsapp) {
      const existingWa = await db.query.owners.findFirst({
        where: eq(owners.whatsapp, whatsapp),
      })
      if (existingWa) throw new Error('WhatsApp sudah terpakai.')
    }
    throw error
  }
}

export async function listHolders(input?: {
  q?: string
  page?: number
  pageSize?: number
}) {
  const pageSize = Math.min(Math.max(input?.pageSize ?? 20, 1), 100)
  const page = Math.max(input?.page ?? 1, 1)
  const needle = (input?.q ?? '').trim().toLowerCase().replace(/[%_]/g, '')
  const filters = [eq(owners.role, 'USER')]
  if (needle) {
    const pattern = `%${needle}%`
    filters.push(
      or(
        sql`lower(${owners.email}) like ${pattern}`,
        sql`lower(coalesce(${owners.name}, '')) like ${pattern}`,
        sql`coalesce(${owners.whatsapp}, '') like ${pattern}`,
      )!,
    )
  }
  const where = and(...filters)

  const [totalRow] = await db
    .select({ total: count() })
    .from(owners)
    .where(where)
  const total = Number(totalRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  if (total === 0) {
    return { users: [], total: 0, page: 1, pageSize, pageCount: 1 }
  }

  const rows = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      whatsapp: owners.whatsapp,
      status: owners.status,
      createdAt: owners.createdAt,
      cardCount: count(units.id),
    })
    .from(owners)
    .leftJoin(units, eq(units.ownerId, owners.id))
    .where(where)
    .groupBy(owners.id)
    .orderBy(desc(owners.createdAt))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize)

  return {
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      whatsapp: row.whatsapp,
      status: row.status,
      cardCount: Number(row.cardCount ?? 0),
      createdAt: row.createdAt?.getTime() ?? null,
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  }
}

export async function getHolder(userId: string) {
  const user = await db.query.owners.findFirst({
    where: and(eq(owners.id, userId), eq(owners.role, 'USER')),
  })
  if (!user) return null
  const cards = await db.query.units.findMany({
    where: eq(units.ownerId, user.id),
    with: { outlet: true },
    orderBy: [desc(units.createdAt)],
    limit: 200,
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    whatsapp: user.whatsapp,
    status: user.status,
    createdAt: user.createdAt?.getTime() ?? null,
    cards: cards.map((card) => ({
      id: card.id,
      publicId: card.publicId,
      status: card.status,
      outletName: card.outlet?.name ?? null,
      activatedAt: card.activatedAt?.getTime() ?? null,
    })),
  }
}

export async function setHolderStatus(
  userId: string,
  status: 'ACTIVE' | 'DISABLED',
) {
  const [row] = await db
    .update(owners)
    .set({ status })
    .where(and(eq(owners.id, userId), eq(owners.role, 'USER')))
    .returning({ id: owners.id, status: owners.status })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  if (status === 'DISABLED') await replaceHolderSessions(userId)
  return row
}

export async function resetHolderPin(userId: string, pin?: string) {
  const nextPin = pin?.trim() ? normalizePin(pin) : generatePin()
  const [row] = await db
    .update(owners)
    .set({ pinHash: hashPin(nextPin) })
    .where(and(eq(owners.id, userId), eq(owners.role, 'USER')))
    .returning({ id: owners.id })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  return { id: row.id, pin: nextPin }
}

export async function resetHolderPassword(userId: string, password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`)
  }
  const [row] = await db
    .update(owners)
    .set({ passwordHash: await hashPassword(password) })
    .where(and(eq(owners.id, userId), eq(owners.role, 'USER')))
    .returning({ id: owners.id })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  await replaceHolderSessions(userId)
  return { ok: true as const }
}

export async function updateHolderProfile(
  userId: string,
  input: { name?: string | null; whatsapp?: string | null },
) {
  const whatsapp =
    input.whatsapp === undefined
      ? undefined
      : input.whatsapp?.trim()
        ? normalizeWhatsapp(input.whatsapp)
        : null
  if (input.whatsapp?.trim() && !whatsapp) {
    throw new Error('Nomor WhatsApp tidak valid.')
  }
  const [row] = await db
    .update(owners)
    .set({
      name: normalizeName(input.name),
      ...(whatsapp !== undefined ? { whatsapp } : {}),
    })
    .where(and(eq(owners.id, userId), eq(owners.role, 'USER')))
    .returning({
      id: owners.id,
      name: owners.name,
      email: owners.email,
      whatsapp: owners.whatsapp,
    })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  return row
}

export async function assignUnitToHolder(input: {
  unitId?: string
  publicId?: string
  ownerId: string
}) {
  const user = await db.query.owners.findFirst({
    where: and(eq(owners.id, input.ownerId), eq(owners.role, 'USER')),
  })
  if (!user) throw new Error('Pengguna tidak ditemukan.')
  if (user.status !== 'ACTIVE') {
    throw new Error('Pengguna dinonaktifkan.')
  }
  const unit = input.unitId
    ? await db.query.units.findFirst({ where: eq(units.id, input.unitId) })
    : await db.query.units.findFirst({
        where: eq(units.publicId, (input.publicId ?? '').trim().toUpperCase()),
      })
  if (!unit) throw new Error('Kartu tidak ditemukan.')
  await db.update(units).set({ ownerId: user.id }).where(eq(units.id, unit.id))
  return {
    unitId: unit.id,
    publicId: unit.publicId,
    ownerId: user.id,
  }
}

export async function unassignUnit(unitId: string) {
  const unit = await db.query.units.findFirst({ where: eq(units.id, unitId) })
  if (!unit) throw new Error('Kartu tidak ditemukan.')
  await db.update(units).set({ ownerId: null }).where(eq(units.id, unit.id))
  return { unitId: unit.id, publicId: unit.publicId, ownerId: null }
}

export async function listAssignableHolders() {
  const rows = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
    })
    .from(owners)
    .where(and(eq(owners.role, 'USER'), eq(owners.status, 'ACTIVE')))
    .orderBy(owners.email)
    .limit(300)
  return rows
}
