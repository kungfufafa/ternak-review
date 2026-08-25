import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/** UUID stored as text so the same IDs port to Postgres later. */
const uuid = () => crypto.randomUUID()
const now = () => new Date()

export const owners = sqliteTable('owners', {
  id: text('id').primaryKey().$defaultFn(uuid),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [index('sessions_owner_idx').on(t.ownerId)],
)

export const stockBatches = sqliteTable('stock_batches', {
  id: text('id').primaryKey().$defaultFn(uuid),
  label: text('label').notNull(),
  type: text('type', { enum: ['CARD', 'QR', 'NFC'] })
    .notNull()
    .default('CARD'),
  count: integer('count').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const outlets = sqliteTable('outlets', {
  id: text('id').primaryKey().$defaultFn(uuid),
  googlePlaceId: text('google_place_id').notNull().unique(),
  name: text('name').notNull(),
  formattedAddress: text('formatted_address'),
  photoUrl: text('photo_url'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const units = sqliteTable(
  'units',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    publicId: text('public_id').notNull().unique(),
    type: text('type', { enum: ['CARD', 'QR', 'NFC'] })
      .notNull()
      .default('CARD'),
    status: text('status', {
      enum: ['IN_STOCK', 'ACTIVE', 'INACTIVE'],
    })
      .notNull()
      .default('IN_STOCK'),
    ownerId: text('owner_id').references(() => owners.id, {
      onDelete: 'set null',
    }),
    outletId: text('outlet_id').references(() => outlets.id, {
      onDelete: 'set null',
    }),
    /** Optional sales/affiliate tag for admin tracking. */
    partnerRef: text('partner_ref'),
    batchId: text('batch_id').references(() => stockBatches.id, {
      onDelete: 'set null',
    }),
    batchSeq: integer('batch_seq'),
    /** Set when the bought NFC sticker is written with this card's URL. */
    nfcEncodedAt: integer('nfc_encoded_at', { mode: 'timestamp_ms' }),
    activatedAt: integer('activated_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('units_owner_idx').on(t.ownerId),
    index('units_outlet_idx').on(t.outletId),
    index('units_status_idx').on(t.status),
    index('units_partner_idx').on(t.partnerRef),
    index('units_batch_idx').on(t.batchId),
  ],
)

export const nfcTags = sqliteTable(
  'nfc_tags',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    publicId: text('public_id').notNull().unique(),
    unitId: text('unit_id').unique().references(() => units.id, {
      onDelete: 'set null',
    }),
    batchId: text('batch_id').references(() => stockBatches.id, {
      onDelete: 'set null',
    }),
    batchSeq: integer('batch_seq'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('nfc_tags_batch_idx').on(t.batchId),
    index('nfc_tags_unit_idx').on(t.unitId),
  ],
)

export const clicks = sqliteTable(
  'clicks',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    at: integer('at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
  },
  (t) => [
    index('clicks_unit_idx').on(t.unitId),
    index('clicks_unit_at_idx').on(t.unitId, t.at),
  ],
)

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    bucketKey: text('bucket_key').notNull(),
    windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('rate_limits_bucket_window_idx').on(
      t.bucketKey,
      t.windowStart,
    ),
  ],
)

export const affiliateLeads = sqliteTable(
  'affiliate_leads',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    nama: text('nama').notNull(),
    email: text('email').notNull(),
    whatsapp: text('whatsapp').notNull(),
    platforms: text('platforms', { mode: 'json' }).$type<string[]>().notNull(),
    usernames: text('usernames', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('affiliate_leads_email_idx').on(t.email),
    index('affiliate_leads_created_idx').on(t.createdAt),
  ],
)

export const ownersRelations = relations(owners, ({ many }) => ({
  units: many(units),
  sessions: many(sessions),
}))

export const stockBatchesRelations = relations(stockBatches, ({ many }) => ({
  units: many(units),
  nfcTags: many(nfcTags),
}))

export const outletsRelations = relations(outlets, ({ many }) => ({
  units: many(units),
}))

export const unitsRelations = relations(units, ({ one, many }) => ({
  owner: one(owners, {
    fields: [units.ownerId],
    references: [owners.id],
  }),
  outlet: one(outlets, {
    fields: [units.outletId],
    references: [outlets.id],
  }),
  batch: one(stockBatches, {
    fields: [units.batchId],
    references: [stockBatches.id],
  }),
  clicks: many(clicks),
  nfcTag: one(nfcTags, {
    fields: [units.id],
    references: [nfcTags.unitId],
  }),
}))

export const nfcTagsRelations = relations(nfcTags, ({ one }) => ({
  unit: one(units, {
    fields: [nfcTags.unitId],
    references: [units.id],
  }),
  batch: one(stockBatches, {
    fields: [nfcTags.batchId],
    references: [stockBatches.id],
  }),
}))

export const clicksRelations = relations(clicks, ({ one }) => ({
  unit: one(units, {
    fields: [clicks.unitId],
    references: [units.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  owner: one(owners, {
    fields: [sessions.ownerId],
    references: [owners.id],
  }),
}))
