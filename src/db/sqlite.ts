import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.ts'
import { resolveSqliteFilePath } from './url.ts'
import type { AppDb, InsertedStockBatch, NewStockBatch, NewStockUnit } from './types.ts'
import { eq } from 'drizzle-orm'
import { roleGrants, stockBatches, units } from './schema.ts'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type SqliteDb = InstanceType<typeof Database>
type SqliteDrizzle = ReturnType<typeof drizzle<typeof schema>>

const INSERT_CHUNK = 80

let _db: SqliteDrizzle | null = null
let _sqlite: SqliteDb | null = null

function getSqlite() {
  open()
  if (!_sqlite) throw new Error('Database belum siap')
  return _sqlite
}

function open(): SqliteDrizzle {
  if (_db) return _db

  const file = resolveSqliteFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })

  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _sqlite = sqlite

  _db = drizzle(sqlite, { schema })

  const migrationsFolder = [
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle'),
  ].find((dir) => fs.existsSync(dir))
  if (migrationsFolder) {
    migrate(_db, { migrationsFolder })
  }

  return _db
}

export function getDb(): AppDb {
  return open()
}

export function replaceRoleGrantRows(
  role: string,
  next: { role: string; permission: string }[],
  seed: { role: string; permission: string }[],
) {
  const database = open()
  const sqlite = getSqlite()
  const run = sqlite.transaction(() => {
    const existing = database.select({ role: roleGrants.role }).from(roleGrants).all()
    if (existing.length === 0 && seed.length > 0) {
      database.insert(roleGrants).values(seed).run()
    }
    database.delete(roleGrants).where(eq(roleGrants.role, role)).run()
    if (next.length > 0) database.insert(roleGrants).values(next).run()
  })
  run.immediate()
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
  const database = open()
  const sqlite = getSqlite()
  const run = sqlite.transaction(() => {
    const [batch] = database
      .insert(stockBatches)
      .values({
        label: batchValues.label,
        type: batchValues.type,
        count: batchValues.count,
      })
      .returning()
      .all()
    if (!batch) throw new Error('Gagal membuat cetakan')

    const rows = unitRows.map((value) => ({ ...value, batchId: batch.id }))
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      database.insert(units).values(rows.slice(i, i + INSERT_CHUNK)).run()
    }
    return batch
  })
  return run()
}
