import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { db } from '../src/db/index.ts'
import { owners, sessions } from '../src/db/schema.ts'
import {
  changeOwnerPassword,
  createSessionForOwner,
  loginWithPassword,
  registerWithPassword,
} from '../src/server/auth.ts'
import { validateAffiliateLead } from '../src/server/affiliate.ts'
import { getPlaceDetails } from '../src/server/places.ts'
import { assertProductionConfig } from '../src/lib/env.ts'

const temp = mkdtempSync(path.join(os.tmpdir(), 'review-security-'))
process.env.DATABASE_URL = `file:${path.join(temp, 'security.db')}`
process.env.DEPLOY_TARGET = 'node'
process.env.NODE_ENV = 'test'
process.env.AUTH_SECRET = 'security-test-auth-secret-00000001'
process.env.IP_HASH_SALT = 'security-test-ip-salt-00000000002'
process.env.ADMIN_SETUP_TOKEN = 'security-test-setup-token-00000003'
process.env.APP_URL = 'http://localhost:3000'
process.env.GOOGLE_MAPS_API_KEY = ''

async function expectReject(run: () => Promise<unknown>, label: string) {
  try {
    await run()
  } catch {
    return
  }
  throw new Error(`${label} seharusnya ditolak`)
}

async function main() {
  await expectReject(
    () =>
      registerWithPassword(
        'attacker@example.com',
        'strong-password-123',
        'wrong-setup-token',
      ),
    'Setup token salah',
  )

  const registrations = await Promise.allSettled([
    registerWithPassword(
      'first@example.com',
      'strong-password-123',
      process.env.ADMIN_SETUP_TOKEN!,
    ),
    registerWithPassword(
      'second@example.com',
      'strong-password-123',
      process.env.ADMIN_SETUP_TOKEN!,
    ),
  ])
  const fulfilled = registrations.filter((row) => row.status === 'fulfilled')
  const [ownerCount] = await db.select({ total: count() }).from(owners)
  if (fulfilled.length !== 1 || Number(ownerCount?.total ?? 0) !== 1) {
    throw new Error('Bootstrap admin harus atomik dan hanya membuat satu owner')
  }

  const owner = await db.query.owners.findFirst()
  if (!owner?.passwordHash?.startsWith('pbkdf2:600000:')) {
    throw new Error('Password baru di Node wajib memakai PBKDF2 600000 iterasi')
  }

  await createSessionForOwner(owner.id)
  const beforeChange = await db
    .select({ total: count() })
    .from(sessions)
    .where(eq(sessions.ownerId, owner.id))
  if (Number(beforeChange[0]?.total ?? 0) < 2) {
    throw new Error('Fixture membutuhkan lebih dari satu session')
  }

  await changeOwnerPassword(
    owner.id,
    'strong-password-123',
    'new-strong-password-456',
  )
  const afterChange = await db
    .select({ total: count() })
    .from(sessions)
    .where(eq(sessions.ownerId, owner.id))
  if (Number(afterChange[0]?.total ?? 0) !== 1) {
    throw new Error('Ganti password harus mencabut semua session lama')
  }
  await expectReject(
    () => loginWithPassword(owner.email, 'strong-password-123'),
    'Password lama',
  )
  await loginWithPassword(owner.email, 'new-strong-password-456')

  const huge = 'x'.repeat(1_000_000)
  const affiliate = validateAffiliateLead({
    nama: huge,
    email: 'valid@example.com',
    whatsapp: '08123456789',
    platforms: ['instagram'],
    usernames: { instagram: huge },
  })
  if (affiliate.ok) throw new Error('Payload affiliate besar wajib ditolak')

  process.env.NODE_ENV = 'production'
  process.env.APP_URL = 'https://review.example'
  process.env.GOOGLE_MAPS_API_KEY = 'configured-test-google-key'
  assertProductionConfig()

  const validIpSalt = process.env.IP_HASH_SALT
  process.env.IP_HASH_SALT = 'change-me-to-a-different-long-random-string'
  try {
    assertProductionConfig()
    throw new Error('Placeholder secret production seharusnya gagal')
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Placeholder secret production seharusnya gagal'
    ) {
      throw error
    }
  }
  process.env.IP_HASH_SALT = validIpSalt

  await expectReject(
    () => getPlaceDetails('DEV_U3Bvb2ZlZCBPdXRsZXQ'),
    'DEV place ID di production',
  )

  process.env.GOOGLE_MAPS_API_KEY = ''
  try {
    assertProductionConfig()
    throw new Error('Production tanpa Google key seharusnya gagal')
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Production tanpa Google key seharusnya gagal'
    ) {
      throw error
    }
  }

  console.log('security flow passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
