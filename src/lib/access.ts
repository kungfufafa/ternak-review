export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'USER'] as const

export type Role = (typeof ROLES)[number]

/**
 * Izin fitur. Nama mengikuti menu.
 * `read` = boleh buka halaman dan melihat datanya.
 * `manage` = boleh mengubah.
 * `own` = hanya data milik akun yang login. `all` = semua data.
 * Fitur baru menambah izin di sini, lalu memasangnya di server function dan menu.
 */
export const PERMISSIONS = [
  'home.read',
  'stock.read',
  'stock.manage',
  'card.design.read',
  'card.design.manage',
  'cards.read.all',
  'cards.read.own',
  'cards.manage.all',
  'cards.manage.own',
  'prospects.manage.own',
  'holders.read',
  'holders.manage',
  'site.read',
  'site.manage',
  'packages.read',
  'packages.manage',
  'whatsapp.read',
  'whatsapp.manage',
  'google.read',
  'google.manage',
  'email.read',
  'email.manage',
  'logs.read',
  'affiliate.read',
  'affiliate.manage',
  'access.manage',
  'activation.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL_PERMISSIONS = new Set<Permission>(PERMISSIONS)

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  USER: new Set([
    'cards.read.own',
    'cards.manage.own',
    'prospects.manage.own',
  ]),
}

export function asRole(role: string | null | undefined): Role {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'USER') return role
  return 'USER'
}

export function permissionsFor(role: string | null | undefined) {
  return ROLE_PERMISSIONS[asRole(role)]
}

export function can(
  roleOrGrants: string | readonly string[] | null | undefined,
  permission: Permission,
) {
  if (roleOrGrants && typeof roleOrGrants !== 'string') {
    return roleOrGrants.includes(permission)
  }
  return permissionsFor(roleOrGrants).has(permission)
}

export function canAny(
  roleOrGrants: string | readonly string[] | null | undefined,
  permissions: readonly Permission[],
) {
  return permissions.some((permission) => can(roleOrGrants, permission))
}

export function isStaff(
  roleOrGrants: string | readonly string[] | null | undefined,
) {
  return can(roleOrGrants, 'home.read')
}

export function canReadCards(
  roleOrGrants: string | readonly string[] | null | undefined,
) {
  return canAny(roleOrGrants, ['cards.read.all', 'cards.read.own'])
}

export function roleLabel(role: string | null | undefined) {
  if (role === 'SUPER_ADMIN') return 'Super admin'
  if (role === 'ADMIN') return 'Admin'
  if (!role || role === 'USER') return 'Pemegang kartu'
  return role
}

const PATH_RULES: { prefix: string; anyOf: readonly Permission[] }[] = [
  { prefix: '/admin/stock', anyOf: ['stock.read'] },
  { prefix: '/admin/card', anyOf: ['card.design.read'] },
  { prefix: '/admin/users', anyOf: ['holders.read'] },
  { prefix: '/admin/site', anyOf: ['site.read'] },
  { prefix: '/admin/packages', anyOf: ['packages.read'] },
  { prefix: '/admin/whatsapp', anyOf: ['whatsapp.read'] },
  { prefix: '/admin/google', anyOf: ['google.read'] },
  { prefix: '/admin/smtp', anyOf: ['email.read'] },
  { prefix: '/admin/logs', anyOf: ['logs.read'] },
  { prefix: '/admin/affiliate', anyOf: ['affiliate.read'] },
  { prefix: '/admin/access', anyOf: ['access.manage'] },
  { prefix: '/admin/activation', anyOf: ['activation.manage'] },
  { prefix: '/admin/prospects', anyOf: ['prospects.manage.own'] },
  { prefix: '/app/prospects', anyOf: ['prospects.manage.own'] },
  { prefix: '/dashboard/units', anyOf: ['cards.read.all', 'cards.read.own'] },
  { prefix: '/admin', anyOf: ['home.read'] },
  { prefix: '/app', anyOf: ['cards.read.own', 'prospects.manage.own'] },
]

export const PERMISSION_GROUPS: {
  label: string
  items: { id: Permission; label: string }[]
}[] = [
  { label: 'Beranda', items: [{ id: 'home.read', label: 'Melihat ringkasan' }] },
  {
    label: 'Produksi kartu',
    items: [
      { id: 'stock.read', label: 'Melihat produksi' },
      { id: 'stock.manage', label: 'Membuat, mencetak, dan menghapus' },
    ],
  },
  {
    label: 'Desain kartu',
    items: [
      { id: 'card.design.read', label: 'Melihat desain' },
      { id: 'card.design.manage', label: 'Mengubah desain' },
    ],
  },
  {
    label: 'Kartu & aktivasi',
    items: [
      { id: 'cards.read.all', label: 'Melihat semua kartu' },
      { id: 'cards.read.own', label: 'Melihat kartu sendiri' },
      { id: 'cards.manage.all', label: 'Mengubah semua kartu' },
      { id: 'cards.manage.own', label: 'Mengubah kartu sendiri' },
    ],
  },
  {
    label: 'Prospek toko',
    items: [{ id: 'prospects.manage.own', label: 'Prospek milik akun sendiri' }],
  },
  {
    label: 'Akun pemegang',
    items: [
      { id: 'holders.read', label: 'Melihat akun' },
      { id: 'holders.manage', label: 'Membuat dan mengubah akun' },
    ],
  },
  {
    label: 'Halaman publik',
    items: [
      { id: 'site.read', label: 'Melihat halaman' },
      { id: 'site.manage', label: 'Mengubah halaman' },
    ],
  },
  {
    label: 'Aktivasi kartu',
    items: [{ id: 'activation.manage', label: 'Mengatur PIN aktivasi' }],
  },
  {
    label: 'Paket review',
    items: [
      { id: 'packages.read', label: 'Melihat paket' },
      { id: 'packages.manage', label: 'Mengubah paket' },
    ],
  },
  {
    label: 'WhatsApp Gateway',
    items: [
      { id: 'whatsapp.read', label: 'Melihat status' },
      { id: 'whatsapp.manage', label: 'Menyambungkan dan mengirim uji' },
    ],
  },
  {
    label: 'Google Maps',
    items: [
      { id: 'google.read', label: 'Melihat kunci' },
      { id: 'google.manage', label: 'Mengubah kunci' },
    ],
  },
  {
    label: 'Email',
    items: [
      { id: 'email.read', label: 'Melihat pengaturan' },
      { id: 'email.manage', label: 'Mengubah dan mengirim uji' },
    ],
  },
  { label: 'Log kiriman', items: [{ id: 'logs.read', label: 'Melihat log' }] },
  {
    label: 'Affiliate',
    items: [
      { id: 'affiliate.read', label: 'Melihat pendaftar' },
      { id: 'affiliate.manage', label: 'Mengelola pendaftaran afiliasi' },
    ],
  },
  {
    label: 'Akses peran',
    items: [{ id: 'access.manage', label: 'Mengatur izin peran' }],
  },
]

export function canAccessPath(
  roleOrGrants: string | readonly string[] | null | undefined,
  pathname: string,
) {
  const rule = PATH_RULES.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  )
  if (!rule) return true
  return canAny(roleOrGrants, rule.anyOf)
}

export function homePath(
  roleOrGrants: string | readonly string[] | null | undefined,
) {
  if (can(roleOrGrants, 'home.read')) return '/admin'
  if (canReadCards(roleOrGrants)) return '/app'
  return '/login'
}
