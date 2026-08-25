import { config } from 'dotenv'
config({ path: '.env.local' })

import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.ts'
import { clicks, outlets, units } from '../src/db/schema.ts'

const DEMO_OUTLETS = [
  {
    name: 'Kopi Kenangan Sudirman',
    address: 'Jl. Jend. Sudirman No.Kav. 52-53, Jakarta Selatan',
    placeId: 'ChIJ-demo-kopi-kenangan-sudirman',
  },
  {
    name: 'Starbucks Reserve Merdeka',
    address: 'Jl. Medan Merdeka Selatan No.6, Jakarta Pusat',
    placeId: 'ChIJ-demo-starbucks-merdeka',
  },
  {
    name: 'Chatime Grand Indonesia',
    address: 'Jl. M.H. Thamrin No.1, Jakarta Pusat',
    placeId: 'ChIJ-demo-chatime-gi',
  },
  {
    name: 'Janji Jiwa Menteng',
    address: 'Jl. HOS Cokroaminoto No.81, Menteng, Jakarta Pusat',
    placeId: 'ChIJ-demo-janji-jiwa-menteng',
  },
  {
    name: "McDonald's Thamrin",
    address: 'Jl. M.H. Thamrin No.5, Jakarta Pusat',
    placeId: 'ChIJ-demo-mcd-thamrin',
  },
  {
    name: 'Bakso Lapangan Tembak',
    address: 'Jl. RS Fatmawati No.15, Jakarta Selatan',
    placeId: 'ChIJ-demo-bakso-fatmawati',
  },
  {
    name: 'Sate Khas Senayan',
    address: 'Plaza Senayan, Jl. Asia Afrika, Jakarta Selatan',
    placeId: 'ChIJ-demo-sate-senayan',
  },
  {
    name: 'Roti O Senayan City',
    address: 'Senayan City, Jl. Asia Afrika, Jakarta Selatan',
    placeId: 'ChIJ-demo-roti-o-sc',
  },
  {
    name: 'Fore Coffee SCBD',
    address: 'SCBD Lot 9, Jl. Jend. Sudirman, Jakarta Selatan',
    placeId: 'ChIJ-demo-fore-scbd',
  },
  {
    name: 'Yoshinoya Plaza Indonesia',
    address: 'Plaza Indonesia, Jl. M.H. Thamrin, Jakarta Pusat',
    placeId: 'ChIJ-demo-yoshinoya-pi',
  },
] as const

const PARTNERS = ['Andi', 'Sari', 'Budi', 'Andi', 'Sari', null, 'Budi', 'Andi'] as const

function dayOffset(daysAgo: number, hour = 12) {
  const d = new Date()
  d.setHours(hour, 12, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}

async function main() {
  await db.delete(clicks)
  await db.delete(outlets).where(eq(outlets.name, 'Outlet Uji'))

  const rows = await db.query.units.findMany({
    orderBy: (table, { asc }) => [asc(table.batchSeq)],
  })
  if (rows.length < 10) {
    throw new Error('Need at least 10 cards in stock to seed demo toko')
  }

  const outletIds: string[] = []
  for (const shop of DEMO_OUTLETS) {
    const existing = await db.query.outlets.findFirst({
      where: eq(outlets.googlePlaceId, shop.placeId),
    })
    if (existing) {
      outletIds.push(existing.id)
      continue
    }
    const [created] = await db
      .insert(outlets)
      .values({
        googlePlaceId: shop.placeId,
        name: shop.name,
        formattedAddress: shop.address,
      })
      .returning()
    outletIds.push(created.id)
  }

  const clickPlan = [64, 41, 28, 19, 33, 12, 8, 22, 5, 3]

  for (let i = 0; i < 10; i++) {
    const unit = rows[i]
    const outletId = outletIds[i]
    const status = i < 8 ? ('ACTIVE' as const) : ('INACTIVE' as const)
    const activatedAt = dayOffset(18 - i, 10 + (i % 6))
    const nfcEncodedAt = dayOffset(22 - i, 15)
    const partnerRef = PARTNERS[i] ?? null

    await db
      .update(units)
      .set({
        status,
        outletId,
        partnerRef,
        nfcEncodedAt,
        activatedAt,
      })
      .where(eq(units.id, unit.id))

    const n = clickPlan[i] ?? 0
    for (let c = 0; c < n; c++) {
      const ago = Math.floor((c / Math.max(n, 1)) * 28)
      await db.insert(clicks).values({
        id: randomUUID(),
        unitId: unit.id,
        at: dayOffset(ago, 8 + (c % 12)),
        userAgent: c % 3 === 0 ? 'Mozilla/5.0 (iPhone)' : 'Mozilla/5.0 (Linux; Android)',
      })
    }
  }

  for (let i = 10; i < Math.min(18, rows.length); i++) {
    await db
      .update(units)
      .set({ nfcEncodedAt: dayOffset(3, 14) })
      .where(eq(units.id, rows[i].id))
  }

  const after = await db.query.units.findMany()
  const byStatus = { IN_STOCK: 0, ACTIVE: 0, INACTIVE: 0 }
  for (const row of after) byStatus[row.status] += 1
  console.log('seeded', byStatus)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
