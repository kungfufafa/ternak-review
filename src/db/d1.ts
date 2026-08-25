import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'
import * as schema from './schema.ts'
import { stockBatches, units } from './schema.ts'
import type { AppDb, InsertedStockBatch, NewStockBatch, NewStockUnit } from './types.ts'

const INSERT_CHUNK = 80

type D1Db = DrizzleD1Database<typeof schema>

let cached: { binding: NonNullable<typeof env.DB>; db: D1Db } | null = null

function hydrateProcessEnv() {
  if (typeof process === 'undefined' || !process.env) return
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && process.env[key] == null) {
      process.env[key] = value
    }
  }
}

function getD1(): D1Db {
  hydrateProcessEnv()
  const binding = env.DB
  if (!binding) {
    throw new Error(
      'Binding D1 `DB` tidak ada. Isi d1_databases.database_id di wrangler.jsonc (hasil `npx wrangler d1 create ternak-review`).',
    )
  }
  if (cached && cached.binding === binding) return cached.db
  const next = drizzle(binding, { schema })
  cached = { binding, db: next }
  return next
}

export function getDb(): AppDb {
  return getD1() as AppDb
}

export const db = new Proxy({} as AppDb, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export async function insertBatchWithUnits(
  batchValues: NewStockBatch,
  unitRows: NewStockUnit[],
): Promise<InsertedStockBatch> {
  const database = getD1()
  const id = crypto.randomUUID()
  const createdAt = new Date()
  const withBatch = unitRows.map((row) => ({ ...row, batchId: id }))

  const statements: BatchItem<'sqlite'>[] = [
    database.insert(stockBatches).values({
      id,
      label: batchValues.label,
      type: batchValues.type,
      count: batchValues.count,
      createdAt,
    }),
  ]
  for (let i = 0; i < withBatch.length; i += INSERT_CHUNK) {
    statements.push(
      database.insert(units).values(withBatch.slice(i, i + INSERT_CHUNK)),
    )
  }

  const [first, ...rest] = statements
  if (!first) throw new Error('Gagal membuat cetakan')
  await database.batch([first, ...rest])

  return {
    id,
    label: batchValues.label,
    type: batchValues.type,
    count: batchValues.count,
    createdAt,
  }
}
