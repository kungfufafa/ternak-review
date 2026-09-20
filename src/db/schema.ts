import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/** UUID stored as text so the same IDs port to Postgres later. */
const uuid = () => crypto.randomUUID()
const now = () => new Date()

export const servicePackages = sqliteTable(
  'service_packages',
  {
    serviceTier: text('service_tier', { enum: ['BASIC', 'PLUS', 'PRO'] })
      .primaryKey(),
    name: text('name').notNull(),
    interceptMaxRating: integer('intercept_max_rating').notNull(),
  },
  (t) => [
    check('service_packages_tier_check', sql`${t.serviceTier} IN ('BASIC', 'PLUS', 'PRO')`),
    check('service_packages_name_check', sql`length(trim(${t.name})) BETWEEN 1 AND 40`),
    check(
      'service_packages_intercept_check',
      sql`typeof(${t.interceptMaxRating}) = 'integer' AND ((${t.serviceTier} = 'BASIC' AND ${t.interceptMaxRating} = 0) OR (${t.serviceTier} IN ('PLUS', 'PRO') AND ${t.interceptMaxRating} BETWEEN 1 AND 5))`,
    ),
  ],
)

export const owners = sqliteTable('owners', {
  id: text('id').primaryKey().$defaultFn(uuid),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  role: text('role', { enum: ['ADMIN', 'USER'] })
    .notNull()
    .default('ADMIN'),
  status: text('status', { enum: ['ACTIVE', 'DISABLED'] })
    .notNull()
    .default('ACTIVE'),
  pinHash: text('pin_hash'),
  whatsapp: text('whatsapp'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
}, (t) => [uniqueIndex('owners_whatsapp_unique').on(t.whatsapp)])

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
  /** Google rating at first card install / first capture. Never overwritten. */
  baselineRating: real('baseline_rating'),
  baselineUserRatingCount: integer('baseline_user_rating_count'),
  baselineCapturedAt: integer('baseline_captured_at', { mode: 'timestamp_ms' }),
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
    serviceTier: text('service_tier', {
      enum: ['BASIC', 'PLUS', 'PRO'],
    })
      .notNull()
      .default('BASIC'),
    reviewMode: text('review_mode', {
      enum: ['GOOGLE_DIRECT', 'OWNER_WHATSAPP', 'ANONYMOUS_WHATSAPP'],
    })
      .notNull()
      .default('GOOGLE_DIRECT'),
    ownerWhatsapp: text('owner_whatsapp'),
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
    index('units_review_mode_idx').on(t.reviewMode),
    index('units_partner_idx').on(t.partnerRef),
    index('units_batch_idx').on(t.batchId),
  ],
)

export const prospects = sqliteTable(
  'prospects',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    googlePlaceId: text('google_place_id').notNull().unique(),
    name: text('name').notNull(),
    formattedAddress: text('formatted_address'),
    rating: real('rating'),
    userRatingCount: integer('user_rating_count'),
    googleMapsUri: text('google_maps_uri'),
    primaryType: text('primary_type'),
    notes: text('notes'),
    status: text('status', {
      enum: ['NEW', 'CONTACTED', 'WON', 'LOST'],
    })
      .notNull()
      .default('NEW'),
    partnerRef: text('partner_ref'),
    createdByOwnerId: text('created_by_owner_id').references(() => owners.id, {
      onDelete: 'set null',
    }),
    unitId: text('unit_id').references(() => units.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    check(
      'prospects_status_check',
      sql`${t.status} IN ('NEW', 'CONTACTED', 'WON', 'LOST')`,
    ),
    index('prospects_status_idx').on(t.status),
    index('prospects_partner_idx').on(t.partnerRef),
    index('prospects_created_idx').on(t.createdAt),
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
    index('clicks_at_idx').on(t.at),
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
  prospects: many(prospects),
}))

export const stockBatchesRelations = relations(stockBatches, ({ many }) => ({
  units: many(units),
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
  prospects: many(prospects),
}))

export const prospectsRelations = relations(prospects, ({ one }) => ({
  createdBy: one(owners, {
    fields: [prospects.createdByOwnerId],
    references: [owners.id],
  }),
  unit: one(units, {
    fields: [prospects.unitId],
    references: [units.id],
  }),
}))

export const clicksRelations = relations(clicks, ({ one }) => ({
  unit: one(units, {
    fields: [clicks.unitId],
    references: [units.id],
  }),
}))

export const reviewFeedbacks = sqliteTable(
  'review_feedbacks',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    message: text('message').notNull(),
    ownerWhatsapp: text('owner_whatsapp').notNull(),
    status: text('status', {
      enum: [
        'QUEUED',
        'PROCESSING',
        'SUBMITTED',
        'DELIVERED',
        'FAILED',
        'UNCERTAIN',
      ],
    })
      .notNull()
      .default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    leaseUntil: integer('lease_until', { mode: 'timestamp_ms' }),
    gatewayMessageId: text('gateway_message_id'),
    deliveryError: text('delivery_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('review_feedback_unit_idx').on(t.unitId),
    index('review_feedback_status_idx').on(t.status),
    index('review_feedback_created_idx').on(t.createdAt),
  ],
)

export const whatsappCommands = sqliteTable(
  'whatsapp_commands',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    command: text('command', {
      enum: ['CONNECT', 'RECONNECT', 'LOGOUT'],
    }).notNull(),
    status: text('status', {
      enum: ['PENDING', 'ACKNOWLEDGED', 'FAILED'],
    })
      .notNull()
      .default('PENDING'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
    acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('whatsapp_commands_status_idx').on(t.status)],
)

export const whatsappGatewayState = sqliteTable('whatsapp_gateway_state', {
  id: text('id').primaryKey().default('primary'),
  status: text('status', {
    enum: ['OFFLINE', 'CONNECTING', 'QR', 'OPEN', 'LOGGED_OUT'],
  })
    .notNull()
    .default('OFFLINE'),
  workerId: text('worker_id'),
  qr: text('qr'),
  lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
  lastError: text('last_error'),
})

export const whatsappOutbox = sqliteTable(
  'whatsapp_outbox',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    to: text('to').notNull(),
    message: text('message').notNull(),
    kind: text('kind', { enum: ['OTP', 'NOTICE', 'TEST'] })
      .notNull()
      .default('OTP'),
    status: text('status', {
      enum: [
        'QUEUED',
        'PROCESSING',
        'SUBMITTED',
        'DELIVERED',
        'FAILED',
        'UNCERTAIN',
      ],
    })
      .notNull()
      .default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    leaseUntil: integer('lease_until', { mode: 'timestamp_ms' }),
    gatewayMessageId: text('gateway_message_id'),
    deliveryError: text('delivery_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('whatsapp_outbox_status_idx').on(t.status),
    index('whatsapp_outbox_created_idx').on(t.createdAt),
  ],
)

export const siteSettings = sqliteTable('site_settings', {
  id: text('id').primaryKey().default('primary'),
  homeEnabled: integer('home_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  affiliateEnabled: integer('affiliate_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const affiliateSettings = sqliteTable('affiliate_settings', {
  id: text('id').primaryKey().default('primary'),
  webhookCipher: text('webhook_cipher'),
  verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const googleSettings = sqliteTable('google_settings', {
  id: text('id').primaryKey().default('primary'),
  apiKeyCipher: text('api_key_cipher'),
  last4: text('last4'),
  verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const smtpSettings = sqliteTable('smtp_settings', {
  id: text('id').primaryKey().default('primary'),
  provider: text('provider', { enum: ['smtp', 'resend'] })
    .notNull()
    .default('smtp'),
  host: text('host').notNull().default(''),
  port: integer('port').notNull().default(587),
  secure: integer('secure', { mode: 'boolean' }).notNull().default(false),
  username: text('username'),
  passwordCipher: text('password_cipher'),
  fromName: text('from_name'),
  fromEmail: text('from_email').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(now),
})

export const emailOutbox = sqliteTable(
  'email_outbox',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    kind: text('kind', {
      enum: ['OTP', 'WELCOME', 'TEST', 'NOTICE'],
    })
      .notNull()
      .default('NOTICE'),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    provider: text('provider', { enum: ['smtp', 'resend'] }).notNull(),
    fromAddress: text('from_address').notNull(),
    status: text('status', {
      enum: ['QUEUED', 'SENT', 'FAILED'],
    })
      .notNull()
      .default('QUEUED'),
    providerMessageId: text('provider_message_id'),
    deliveryError: text('delivery_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('email_outbox_status_idx').on(t.status),
    index('email_outbox_created_idx').on(t.createdAt),
  ],
)

export const emailOtps = sqliteTable(
  'email_otps',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('email_otps_owner_idx').on(t.ownerId),
    index('email_otps_email_idx').on(t.email),
  ],
)

export const loginOtps = sqliteTable(
  'login_otps',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    whatsapp: text('whatsapp').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now),
  },
  (t) => [
    index('login_otps_owner_idx').on(t.ownerId),
    index('login_otps_whatsapp_idx').on(t.whatsapp),
  ],
)

export const reviewFeedbackRelations = relations(reviewFeedbacks, ({ one }) => ({
  unit: one(units, {
    fields: [reviewFeedbacks.unitId],
    references: [units.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  owner: one(owners, {
    fields: [sessions.ownerId],
    references: [owners.id],
  }),
}))
