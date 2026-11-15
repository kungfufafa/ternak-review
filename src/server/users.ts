import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import { accessRoles, owners, units } from '#/db/schema'
import {
  assignableAccountRoles,
  ensureSystemRoles,
  holderRoleKeys,
  roleWithinActor,
} from '#/server/role-access'
import { parseCode } from '#/lib/card-code'
import { hashPassword } from '#/lib/crypto'
import { generatePin, hashPin, normalizePin } from '#/lib/pin'
import { replaceHolderSessions } from './auth'
import { notifyHolderCredentials } from './holder-notify'
import { transferUnitProspects } from './prospects'
import { normalizeWhatsapp } from './review'

const MIN_PASSWORD_LENGTH = 6

/** The signed-in account changing another account. Scripts pass none. */
export type AccountActor = { ownerId: string; role: string }

async function holderScope(userId?: string) {
  const roles = await holderRoleKeys()
  const filters = [inArray(owners.role, roles)]
  if (userId) filters.push(eq(owners.id, userId))
  return and(...filters)
}

async function managedAccount(userId: string, actor?: AccountActor) {
  const user = await db.query.owners.findFirst({
    where: await holderScope(userId),
    columns: { id: true, role: true },
  })
  if (!user) throw new Error('Pengguna tidak ditemukan.')
  if (actor && !(await roleWithinActor(actor.role, user.role))) {
    throw new Error('Akun ini punya akses yang tidak kamu miliki.')
  }
  return user
}

async function assertMayAssignRole(roleKey: string, actor?: AccountActor) {
  if (roleKey === 'SUPER_ADMIN') throw new Error('Peran ini tidak bisa dipilih.')
  const role = await db.query.accessRoles.findFirst({
    where: eq(accessRoles.key, roleKey),
  })
  if (!role) throw new Error('Peran tidak ditemukan.')
  if (actor && !(await roleWithinActor(actor.role, role.key))) {
    throw new Error('Peran ini punya akses yang tidak kamu miliki.')
  }
  return role
}

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase()
  if (!value.includes('@')) throw new Error('Email tidak valid.')
  return value
}

function normalizeName(name?: string | null) {
  const value = name?.trim().replace(/\s+/g, ' ') ?? ''
  return value.length > 0 ? value.slice(0, 80) : null
}

export async function createHolder(
  input: {
    email?: string
    password?: string
    whatsapp?: string | null
    name?: string | null
    pin?: string
    role?: string
  },
  actor?: AccountActor,
) {
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
  await ensureSystemRoles()
  const role = await assertMayAssignRole(input.role?.trim() || 'USER', actor)
  try {
    const [created] = await db
      .insert(owners)
      .values({
        email,
        name: normalizeName(input.name),
        passwordHash: hasPassword ? await hashPassword(password) : null,
        whatsapp,
        role: role.key,
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
    const notify = await notifyHolderCredentials({
      name: created.name,
      email: created.email,
      whatsapp: created.whatsapp,
      pin,
      kind: 'WELCOME',
    })
    return { ...created, pin, notify }
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
  actorRole?: string
}) {
  const pageSize = Math.min(Math.max(input?.pageSize ?? 20, 1), 100)
  const page = Math.max(input?.page ?? 1, 1)
  const needle = (input?.q ?? '').trim().toLowerCase().replace(/[%_]/g, '')
  const filters = [inArray(owners.role, await holderRoleKeys())]
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
  const roles = await assignableAccountRoles(input?.actorRole)
  if (total === 0) {
    return { users: [], roles, total: 0, page: 1, pageSize, pageCount: 1 }
  }

  const rows = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      whatsapp: owners.whatsapp,
      status: owners.status,
      role: owners.role,
      roleName: accessRoles.name,
      createdAt: owners.createdAt,
      cardCount: count(units.id),
    })
    .from(owners)
    .leftJoin(accessRoles, eq(owners.role, accessRoles.key))
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
      role: row.role,
      roleName: row.roleName ?? row.role,
      cardCount: Number(row.cardCount ?? 0),
      createdAt: row.createdAt?.getTime() ?? null,
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
    roles,
  }
}

export async function getHolder(userId: string, actorRole?: string) {
  const user = await db.query.owners.findFirst({
    where: await holderScope(userId),
  })
  if (!user) return null
  const cards = await db.query.units.findMany({
    where: eq(units.ownerId, user.id),
    with: { outlet: true },
    orderBy: [desc(units.createdAt)],
    limit: 200,
  })
  const roles = await assignableAccountRoles(actorRole)
  if (!roles.some((role) => role.key === user.role)) {
    // Keep the current role in the list so the form still shows it.
    const current = await db.query.accessRoles.findFirst({
      where: eq(accessRoles.key, user.role),
      columns: { key: true, name: true },
    })
    roles.unshift(current ?? { key: user.role, name: user.role })
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    whatsapp: user.whatsapp,
    status: user.status,
    role: user.role,
    roles,
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
  actor?: AccountActor,
) {
  await managedAccount(userId, actor)
  const [row] = await db
    .update(owners)
    .set({ status })
    .where(await holderScope(userId))
    .returning({ id: owners.id, status: owners.status })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  if (status === 'DISABLED') await replaceHolderSessions(userId)
  return row
}

export async function resetHolderPin(
  userId: string,
  pin?: string,
  actor?: AccountActor,
) {
  await managedAccount(userId, actor)
  const nextPin = pin?.trim() ? normalizePin(pin) : generatePin()
  const [row] = await db
    .update(owners)
    .set({ pinHash: hashPin(nextPin) })
    .where(await holderScope(userId))
    .returning({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      whatsapp: owners.whatsapp,
    })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  const notify = await notifyHolderCredentials({
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    pin: nextPin,
    kind: 'NOTICE',
  })
  return { id: row.id, pin: nextPin, notify }
}

export async function resetHolderPassword(
  userId: string,
  password: string,
  actor?: AccountActor,
) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`)
  }
  await managedAccount(userId, actor)
  const [row] = await db
    .update(owners)
    .set({ passwordHash: await hashPassword(password) })
    .where(await holderScope(userId))
    .returning({ id: owners.id })
  if (!row) throw new Error('Pengguna tidak ditemukan.')
  await replaceHolderSessions(userId)
  return { ok: true as const }
}

export async function updateHolderProfile(
  userId: string,
  input: { name?: string | null; whatsapp?: string | null; role?: string },
  actor?: AccountActor,
) {
  const current = await managedAccount(userId, actor)
  const nextRole =
    input.role && input.role !== current.role ? input.role : undefined
  if (nextRole) {
    if (actor?.ownerId === userId) {
      throw new Error('Peran akunmu sendiri tidak bisa diubah.')
    }
    await assertMayAssignRole(nextRole, actor)
  }
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
      ...(nextRole ? { role: nextRole } : {}),
    })
    .where(await holderScope(userId))
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
    where: await holderScope(input.ownerId),
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
  // A trial in progress moves with the card, so the new holder can collect
  // or close it and the previous holder no longer can.
  await transferUnitProspects(unit.id, user.id)
  return {
    unitId: unit.id,
    publicId: unit.publicId,
    ownerId: user.id,
  }
}

export async function getHolderHandoff(userId: string) {
  const user = await db.query.owners.findFirst({
    where: await holderScope(userId),
  })
  if (!user) return null
  const [row] = await db
    .select({ total: count() })
    .from(units)
    .where(eq(units.ownerId, user.id))
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    cardCount: Number(row?.total ?? 0),
  }
}

export async function previewHandoff(raw: string) {
  const parsed = parseCode(raw)
  const unit = await db.query.units.findFirst({
    where: eq(units.publicId, parsed.id),
    with: { owner: true },
  })
  if (!unit) throw new Error('QR kartu tidak ditemukan')
  return {
    unitId: unit.id,
    publicId: unit.publicId,
    holder: unit.owner
      ? {
          id: unit.owner.id,
          name: unit.owner.name,
          email: unit.owner.email,
        }
      : null,
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
      whatsapp: owners.whatsapp,
    })
    .from(owners)
    .where(and(inArray(owners.role, await holderRoleKeys()), eq(owners.status, 'ACTIVE')))
    .orderBy(owners.email)
    .limit(300)
  return rows
}
