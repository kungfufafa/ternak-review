import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type * as schema from './schema.ts'

export type AppDb = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>

export type NewStockBatch = {
  label: string
  type: 'CARD'
  count: number
}

export type NewStockUnit = {
  publicId: string
  type: 'CARD'
  status: 'IN_STOCK'
  batchSeq: number
}

export type InsertedStockBatch = {
  id: string
  label: string
  type: 'CARD' | 'QR' | 'NFC'
  count: number
  createdAt: Date
}
