import { readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.GOOGLE_MAPS_API_KEY = ''
process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'review-qa-')), 'qa.db')}`

const { PERMISSIONS, canAccessPath, permissionsFor } = await import('#/lib/access')
const { db } = await import('#/db')
const { prospects, roleGrants, units } = await import('#/db/schema')
const {
  assignableAccountRoles,
  clearRoleGrantCache,
  createRole,
  saveRoleGrants,
  storedPermissions,
} = await import('#/server/role-access')
const { saveProspect, listProspects, deleteProspect } = await import(
  '#/server/prospects'
)
const { listUnits } = await import('#/server/clicks')
const { generateStockBatch } = await import('#/server/stock')
const { collectProspectTrial } = await import('#/server/activation')
const {
  assignUnitToHolder,
  createHolder,
  previewHandoff,
  resetHolderPassword,
  setHolderStatus,
  updateHolderProfile,
} = await import('#/server/users')
const { eq } = await import('drizzle-orm')

const failures: string[] = []

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`ok  ${name}`)
    return
  }
  const line = detail ? `${name} — ${detail}` : name
  failures.push(line)
  console.error(`FAIL ${line}`)
}

async function rejects(run: () => Promise<unknown>) {
  try {
    await run()
    return false
  } catch {
    return true
  }
}

async function main() {
  const source = readFileSync(
    new URL('../src/server/functions.ts', import.meta.url),
    'utf8',
  )
  const used = [
    ...source.matchAll(/require(?:Any)?Permission\((?:\s*'([^']+)'|\[([^\]]+)\])/g),
  ].flatMap((match) => {
    if (match[1]) return [match[1]]
    return [...match[2].matchAll(/'([^']+)'/g)].map((item) => item[1])
  })
  const known = new Set<string>(PERMISSIONS)
  const unknown = [...new Set(used)].filter((item) => !known.has(item))
  check('setiap pintu server memakai izin yang ada', unknown.length === 0, unknown.join(', '))
  check('izin akses peran ikut katalog', known.has('access.manage'))

  const userDefaults = permissionsFor('USER')
  const adminDefaults = permissionsFor('ADMIN')
  check('pemegang tidak melihat semua kartu', !userDefaults.has('cards.read.all'))
  check('pemegang tidak membuka beranda admin', !userDefaults.has('home.read'))
  check('pemegang tidak mengatur peran', !userDefaults.has('access.manage'))
  check('pemegang boleh prospek sendiri', userDefaults.has('prospects.manage.own'))
  check('admin boleh mengatur peran', adminDefaults.has('access.manage'))
  check('admin melihat semua kartu', adminDefaults.has('cards.read.all'))
  check(
    'super admin memegang semua izin',
    permissionsFor('SUPER_ADMIN').size === PERMISSIONS.length,
  )
  check('pemegang tidak masuk /admin', !canAccessPath('USER', '/admin'))
  check('pemegang masuk kartu sendiri', canAccessPath('USER', '/dashboard/units'))
  check('pemegang masuk prospek', canAccessPath('USER', '/app/prospects'))
  check('admin masuk produksi', canAccessPath('ADMIN', '/admin/stock'))

  const beforeSave = await storedPermissions('USER')
  check('belum ada simpanan, pemegang pakai bawaan', !beforeSave.has('holders.read'))

  await saveRoleGrants({
    role: 'USER',
    permissions: ['prospects.manage.own', 'bukan-izin', 'cards.read.own'],
    actorRole: 'SUPER_ADMIN',
  })
  clearRoleGrantCache()
  const narrowed = await storedPermissions('USER')
  check('izin palsu dibuang', !narrowed.has('bukan-izin' as never))
  check('simpanan pemegang menggantikan bawaan', !narrowed.has('cards.manage.own'))
  check('izin yang dicentang tersimpan', narrowed.has('cards.read.own'))
  const adminAfterUserSave = await storedPermissions('ADMIN')
  check(
    'menyimpan pemegang tidak mengosongkan admin',
    adminAfterUserSave.has('home.read') && adminAfterUserSave.has('stock.manage'),
  )

  let locked = false
  try {
    await saveRoleGrants({
      role: 'ADMIN',
      permissions: ['home.read'],
      actorRole: 'ADMIN',
    })
  } catch {
    locked = true
  }
  check('admin tidak bisa mencabut izin mengatur akses dari dirinya', locked)
  check(
    'peran admin tetap bisa mengatur akses',
    (await storedPermissions('ADMIN')).has('access.manage'),
  )

  await saveRoleGrants({
    role: 'ADMIN',
    permissions: ['home.read', 'cards.read.own'],
    actorRole: 'SUPER_ADMIN',
  })
  clearRoleGrantCache()
  const reducedAdmin = await storedPermissions('ADMIN')
  check('super admin boleh mempersempit admin', !reducedAdmin.has('stock.manage'))
  check('super admin tidak ikut tersempitkan', (await storedPermissions('SUPER_ADMIN')).has('stock.manage'))

  await saveRoleGrants({
    role: 'ADMIN',
    permissions: [...permissionsFor('ADMIN')],
    actorRole: 'SUPER_ADMIN',
  })
  await saveRoleGrants({
    role: 'USER',
    permissions: [...permissionsFor('USER')],
    actorRole: 'SUPER_ADMIN',
  })
  clearRoleGrantCache()

  const amar = await createHolder({
    email: 'amar-qa@example.com',
    password: 'amar-qa-pass',
    name: 'Amar',
    pin: '2580',
  })
  const holderB = await createHolder({
    email: 'holder-b-qa@example.com',
    password: 'holder-b-pass',
    name: 'Holder B',
    pin: '9021',
  })
  const place = 'DEV_dG9rby1xYS1hY2Nlc3M'
  const amarSaved = await saveProspect({
    placeId: place,
    createdByOwnerId: amar.id,
  })
  const holderSaved = await saveProspect({
    placeId: place,
    createdByOwnerId: holderB.id,
  })
  check('toko yang sama boleh masuk dua akun', amarSaved.created && holderSaved.created)
  check('dua baris prospek berbeda', amarSaved.prospect.id !== holderSaved.prospect.id)
  const amarList = await listProspects({ ownerId: amar.id })
  const holderList = await listProspects({ ownerId: holderB.id })
  check(
    'daftar Amar tidak berisi prospek Holder B',
    amarList.prospects.length === 1 &&
      amarList.prospects[0]?.id === amarSaved.prospect.id,
  )
  check(
    'daftar Holder B tidak berisi prospek Amar',
    holderList.prospects.length === 1 &&
      holderList.prospects[0]?.id === holderSaved.prospect.id,
  )
  await deleteProspect(amarSaved.prospect.id, amar.id)
  const holderStill = await listProspects({ ownerId: holderB.id })
  check('hapus Amar tidak menghapus Holder B', holderStill.prospects.length === 1)
  let crossDelete = false
  try {
    await deleteProspect(holderSaved.prospect.id, amar.id)
  } catch {
    crossDelete = true
  }
  check('Amar tidak bisa menghapus prospek Holder B', crossDelete)

  const batch = await generateStockBatch({ count: 3, label: 'QA-AKSES' })
  await assignUnitToHolder({ publicId: batch.units[0]?.publicId, ownerId: amar.id })
  await assignUnitToHolder({ publicId: batch.units[1]?.publicId, ownerId: holderB.id })
  const amarCards = await listUnits({ ownerId: amar.id })
  const holderCards = await listUnits({ ownerId: holderB.id })
  const allCards = await listUnits({})
  check('kartu Amar hanya satu', amarCards.total === 1 && amarCards.units[0]?.holderId === amar.id)
  check(
    'kartu Holder B hanya satu',
    holderCards.total === 1 && holderCards.units[0]?.holderId === holderB.id,
  )
  check('tanpa saringan pemilik, stok tetap kelihatan', allCards.total === 3)

  const loose = batch.units[2]
  const loosePreview = loose ? await previewHandoff(loose.publicId) : null
  check(
    'kartu kosong belum punya pemegang',
    loosePreview?.holder === null && loosePreview.publicId === loose?.publicId,
  )
  const amarCode = batch.units[0]?.publicId
  const amarPreview = amarCode
    ? await previewHandoff(`https://contoh.test/r/${amarCode}`)
    : null
  check('scan URL kartu Amar dikenali', amarPreview?.holder?.id === amar.id)
  const holderCode = batch.units[1]?.publicId
  const holderPreview = holderCode ? await previewHandoff(holderCode) : null
  check(
    'kartu Holder B ketahuan milik orang lain',
    holderPreview?.holder?.id === holderB.id,
  )

  if (loose && loosePreview) {
    await assignUnitToHolder({ publicId: loose.publicId, ownerId: amar.id })
    await db
      .update(units)
      .set({
        status: 'ACTIVE',
        activatedAt: new Date(),
        partnerRef: 'trial-lama',
      })
      .where(eq(units.id, loosePreview.unitId))
    const [trial] = await db
      .insert(prospects)
      .values({
        googlePlaceId: 'DEV_trial_pindah',
        name: 'Toko Trial Lama',
        createdByOwnerId: amar.id,
        unitId: loosePreview.unitId,
        installKind: 'TRIAL',
        status: 'CONTACTED',
        trialStartedAt: new Date(Date.now() - 86_400_000),
        trialEndsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: prospects.id })
    const collected = trial ? await collectProspectTrial(trial.id, amar.id) : null
    const kept = await db.query.units.findFirst({
      where: eq(units.id, loosePreview.unitId),
    })
    check(
      'ambil trial melepas toko dan mempertahankan pemegang',
      collected?.installState === 'collected' &&
        collected.unitId == null &&
        kept?.status === 'IN_STOCK' &&
        kept.ownerId === amar.id &&
        kept.outletId == null &&
        kept.partnerRef == null &&
        kept.activatedAt == null,
    )
  }

  const started = Date.now()
  await Promise.all(
    Array.from({ length: 40 }, () => storedPermissions('USER')),
  )
  const readMs = Date.now() - started
  check(`40 baca izin bersamaan selesai (${readMs} ms)`, readMs < 3000)

  const writers = Array.from({ length: 12 }, (_, index) =>
    saveRoleGrants({
      role: 'USER',
      permissions:
        index % 2 === 0
          ? ['cards.read.own', 'prospects.manage.own']
          : ['cards.read.own', 'cards.manage.own', 'prospects.manage.own'],
      actorRole: 'SUPER_ADMIN',
    }),
  )
  const writeResults = await Promise.allSettled(writers)
  const writeFailed = writeResults.filter((item) => item.status === 'rejected')
  clearRoleGrantCache()
  const afterRace = await storedPermissions('USER')
  const adminIntact = await storedPermissions('ADMIN')
  check(
    '12 simpan izin bersamaan tidak melempar',
    writeFailed.length === 0,
    writeFailed.map((item) => (item.status === 'rejected' ? String(item.reason) : '')).join(' | '),
  )
  check(
    'hasil simpanan terakhir masih izin yang sah',
    afterRace.has('cards.read.own') && afterRace.has('prospects.manage.own'),
  )
  check('simpanan bersamaan tidak merusak admin', adminIntact.has('access.manage'))

  const placeIds = Array.from({ length: 20 }, (_, index) => `DEV_cWEtdG9rby0${index}`)
  const burst = await Promise.allSettled(
    placeIds.flatMap((placeId) => [
      saveProspect({ placeId, createdByOwnerId: amar.id }),
      saveProspect({ placeId, createdByOwnerId: holderB.id }),
      saveProspect({ placeId, createdByOwnerId: amar.id }),
    ]),
  )
  const burstFailed = burst.filter((item) => item.status === 'rejected')
  const amarRows = await db
    .select({ googlePlaceId: prospects.googlePlaceId })
    .from(prospects)
    .where(eq(prospects.createdByOwnerId, amar.id))
  const holderRows = await db
    .select({ googlePlaceId: prospects.googlePlaceId })
    .from(prospects)
    .where(eq(prospects.createdByOwnerId, holderB.id))
  const burstIds = new Set(placeIds)
  check(
    '60 simpan prospek bersamaan tidak melempar',
    burstFailed.length === 0,
    burstFailed
      .slice(0, 3)
      .map((item) => (item.status === 'rejected' ? String(item.reason) : ''))
      .join(' | '),
  )
  check(
    'Amar tetap 20 toko unik setelah simpan ganda',
    amarRows.filter((row) => burstIds.has(row.googlePlaceId)).length === 20,
  )
  check(
    'Holder B tetap 20 toko unik',
    holderRows.filter((row) => burstIds.has(row.googlePlaceId)).length === 20,
  )

  const managerRole = await createRole('Pengelola akun QA')
  await saveRoleGrants({
    role: managerRole.key,
    permissions: ['holders.read', 'holders.manage', ...permissionsFor('USER')],
    actorRole: 'SUPER_ADMIN',
  })
  const wideRole = await createRole('Pengawas kartu QA')
  await saveRoleGrants({
    role: wideRole.key,
    permissions: ['cards.read.all', 'cards.manage.all', 'access.manage'],
    actorRole: 'SUPER_ADMIN',
  })
  const manager = await createHolder({
    email: 'manager-qa@example.com',
    password: 'manager-qa-pass',
    pin: '6153',
    role: managerRole.key,
  })
  const wide = await createHolder({
    email: 'wide-qa@example.com',
    password: 'wide-qa-pass',
    pin: '3917',
    role: wideRole.key,
  })
  const actor = { ownerId: manager.id, role: managerRole.key }
  const offered = (await assignableAccountRoles(managerRole.key)).map((role) => role.key)
  check(
    'pengelola akun hanya ditawari peran setara',
    offered.includes('USER') && !offered.includes('ADMIN') && !offered.includes(wideRole.key),
    offered.join(', '),
  )
  const made = await createHolder(
    { email: 'made-by-manager@example.com', password: 'made-by-manager', pin: '8264' },
    actor,
  )
  check('pengelola akun boleh membuat pemegang biasa', Boolean(made.id))
  check(
    'pengelola akun tidak bisa membuat admin',
    await rejects(() =>
      createHolder(
        { email: 'sneaky-admin@example.com', password: 'sneaky-admin-1', pin: '4071', role: 'ADMIN' },
        actor,
      ),
    ),
  )
  check(
    'pengelola akun tidak bisa menaikkan pemegang jadi admin',
    await rejects(() => updateHolderProfile(amar.id, { role: 'ADMIN' }, actor)),
  )
  check(
    'pengelola akun tidak bisa mengubah perannya sendiri',
    await rejects(() => updateHolderProfile(manager.id, { role: 'USER' }, actor)),
  )
  check(
    'pengelola akun tidak bisa reset password akun berakses lebih tinggi',
    await rejects(() => resetHolderPassword(wide.id, 'taken-over-1', actor)),
  )
  check(
    'pengelola akun tidak bisa menonaktifkan akun berakses lebih tinggi',
    await rejects(() => setHolderStatus(wide.id, 'DISABLED', actor)),
  )
  const renamed = await updateHolderProfile(amar.id, { name: 'Amar QA', role: 'USER' }, actor)
  check('pengelola akun tetap bisa mengubah profil pemegang biasa', renamed.name === 'Amar QA')

  const grantRows = await db.select().from(roleGrants)
  check('tabel izin peran terisi', grantRows.length > 0)

  if (failures.length > 0) {
    console.error(`\n${failures.length} gagal`)
    process.exitCode = 1
    return
  }
  console.log('\nsemua pemeriksaan lulus')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
