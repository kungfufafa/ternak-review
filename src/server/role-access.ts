import { eq } from 'drizzle-orm'
import { db, replaceRoleGrantRows } from '#/db'
import { accessRoles, owners, roleGrants } from '#/db/schema'
import {
  PERMISSIONS,
  permissionsFor,
  type Permission,
} from '#/lib/access'

const CACHE_MS = 5_000
const SYSTEM_ROLES = [
  { key: 'SUPER_ADMIN', name: 'Super admin', system: true },
  { key: 'ADMIN', name: 'Admin', system: true },
  { key: 'USER', name: 'Pemegang kartu', system: true },
] as const

let cache: {
  at: number
  seeded: boolean
  rows: Map<string, Set<Permission>>
} | null = null

function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export function clearRoleGrantCache() {
  cache = null
}

export function roleKeyFromName(name: string) {
  const key = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  if (key.length < 2) throw new Error('Nama peran terlalu pendek.')
  if (key === 'super-admin' || key === 'super_admin' || key === 'admin' || key === 'user') {
    throw new Error('Nama peran ini tidak bisa dipakai.')
  }
  return key
}

export async function ensureSystemRoles() {
  const existing = await db.select({ key: accessRoles.key }).from(accessRoles)
  const keys = new Set(existing.map((row) => row.key))
  const missing = SYSTEM_ROLES.filter((role) => !keys.has(role.key))
  if (missing.length > 0) await db.insert(accessRoles).values([...missing])
}

async function loadMap() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache
  const rows = await db.select().from(roleGrants)
  const map = new Map<string, Set<Permission>>()
  const seeded = rows.length === 0
  if (seeded) {
    map.set('ADMIN', new Set(permissionsFor('ADMIN')))
    map.set('USER', new Set(permissionsFor('USER')))
  } else {
    for (const row of rows) {
      if (!isPermission(row.permission)) continue
      const grants = map.get(row.role) ?? new Set<Permission>()
      grants.add(row.permission)
      map.set(row.role, grants)
    }
  }
  cache = { at: Date.now(), seeded, rows: map }
  return cache
}

export async function storedPermissions(role: string | null | undefined) {
  if (role === 'SUPER_ADMIN') return new Set<Permission>(PERMISSIONS)
  const loaded = await loadMap()
  if (!role) return new Set<Permission>()
  if (loaded.rows.has(role)) return new Set(loaded.rows.get(role))
  return new Set<Permission>()
}

export async function assignableAccountRoles() {
  await ensureSystemRoles()
  const roles = await db
    .select({ key: accessRoles.key, name: accessRoles.name })
    .from(accessRoles)
  return roles
    .filter((role) => role.key !== 'SUPER_ADMIN')
    .sort((left, right) => left.name.localeCompare(right.name, 'id'))
}

export async function holderRoleKeys() {
  await ensureSystemRoles()
  const roles = await db.select({ key: accessRoles.key }).from(accessRoles)
  const keys: string[] = []
  for (const role of roles) {
    if (role.key === 'SUPER_ADMIN') continue
    const grants = await storedPermissions(role.key)
    if (!grants.has('home.read')) keys.push(role.key)
  }
  return keys.length > 0 ? keys : ['USER']
}

export type RoleRecord = {
  key: string
  name: string
  system: boolean
  locked: boolean
  permissions: string[]
}

export async function listRoles(): Promise<RoleRecord[]> {
  await ensureSystemRoles()
  const roles = await db.select().from(accessRoles)
  const loaded = await loadMap()
  return roles
    .map((role) => ({
      key: role.key,
      name: role.name,
      system: role.system,
      locked: role.key === 'SUPER_ADMIN',
      permissions:
        role.key === 'SUPER_ADMIN'
          ? [...PERMISSIONS]
          : [...(loaded.rows.get(role.key) ?? [])],
    }))
    .sort((left, right) => {
      if (left.locked !== right.locked) return left.locked ? -1 : 1
      if (left.system !== right.system) return left.system ? -1 : 1
      return left.name.localeCompare(right.name, 'id')
    })
}

export function saveRoleGrants(input: {
  role: string
  name?: string
  permissions: string[]
  actorRole: string
}) {
  return enqueueGrantWrite(() => writeRoleGrants(input))
}

let grantWrite: Promise<unknown> = Promise.resolve()

function enqueueGrantWrite<T>(task: () => Promise<T>) {
  const run = grantWrite.then(task, task)
  grantWrite = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function writeRoleGrants(input: {
  role: string
  name?: string
  permissions: string[]
  actorRole: string
}) {
  await ensureSystemRoles()
  if (input.role === 'SUPER_ADMIN') {
    throw new Error('Akses super admin tidak bisa diubah.')
  }
  const role = await db.query.accessRoles.findFirst({
    where: eq(accessRoles.key, input.role),
  })
  if (!role) throw new Error('Peran tidak ditemukan.')
  if (input.name !== undefined) {
    const label = input.name.trim().replace(/\s+/g, ' ')
    if (label.length < 2 || label.length > 40) {
      throw new Error('Nama peran 2–40 karakter.')
    }
    const taken = await db.query.accessRoles.findFirst({
      where: eq(accessRoles.name, label),
    })
    if (taken && taken.key !== role.key) {
      throw new Error('Nama peran sudah dipakai.')
    }
    await db.update(accessRoles).set({ name: label }).where(eq(accessRoles.key, role.key))
  }
  const allowed = [...new Set(input.permissions.filter(isPermission))]
  if (input.actorRole === input.role && !allowed.includes('access.manage')) {
    throw new Error('Jangan cabut izin mengatur akses dari peran yang sedang kamu pakai.')
  }
  const seed = (['ADMIN', 'USER'] as const).flatMap((key) =>
    [...permissionsFor(key)].map((permission) => ({ role: key, permission })),
  )
  await replaceRoleGrantRows(
    input.role,
    allowed.map((permission) => ({ role: input.role, permission })),
    seed,
  )
  clearRoleGrantCache()
  return { role: input.role, permissions: allowed }
}

export async function createRole(name: string) {
  await ensureSystemRoles()
  const label = name.trim().replace(/\s+/g, ' ')
  if (label.length < 2 || label.length > 40) {
    throw new Error('Nama peran 2–40 karakter.')
  }
  const key = roleKeyFromName(label)
  const existing = await db.query.accessRoles.findFirst({
    where: eq(accessRoles.key, key),
  })
  if (existing) throw new Error('Peran dengan nama ini sudah ada.')
  await db.insert(accessRoles).values({ key, name: label, system: false })
  clearRoleGrantCache()
  return { key, name: label }
}

export async function deleteRole(key: string) {
  await ensureSystemRoles()
  const role = await db.query.accessRoles.findFirst({
    where: eq(accessRoles.key, key),
  })
  if (!role) throw new Error('Peran tidak ditemukan.')
  if (role.system) throw new Error('Peran bawaan tidak bisa dihapus.')
  const used = await db.query.owners.findFirst({
    where: eq(owners.role, key),
    columns: { id: true },
  })
  if (used) throw new Error('Peran masih dipakai akun. Pindahkan akunnya dulu.')
  await db.delete(roleGrants).where(eq(roleGrants.role, key))
  await db.delete(accessRoles).where(eq(accessRoles.key, key))
  clearRoleGrantCache()
  return { ok: true as const }
}
