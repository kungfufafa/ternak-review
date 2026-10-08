import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  activateUnit,
  collectProspectTrial,
  convertProspectToSold,
  getActivationCard,
  getActivationCardForViewer,
  rebindUnitOutlet,
  verifyActivationAccess,
} from '#/server/activation'
import {
  adminExists,
  changeOwnerPassword,
  destroyCurrentSession,
  getSessionOwner,
  loginWithPassword,
  registerWithPassword,
} from '#/server/auth'
import type { Permission } from '#/lib/access'
import {
  createRole,
  deleteRole,
  listRoles,
  saveRoleGrants,
  storedPermissions,
} from '#/server/role-access'
import { assertAppUrlForProduction, getAppUrlInfo } from '#/lib/env'
import { PROSPECT_CATEGORIES } from '#/lib/place-rating'
import { cardDesignSchema } from '#/lib/card-design'
import {
  deleteUnit,
  getAdminDashboardSummary,
  getUnitDetail,
  listUnits,
  resetUnitToStock,
  setUnitActiveState,
  updateUnitPartner,
} from '#/server/clicks'
import {
  getPlaceDetails,
  nearbyPlaces,
  scanCityPlaces,
  searchActivationPlaces,
  textSearchPlacesPaged,
} from '#/server/places'
import {
  deleteProspect,
  deleteProspects,
  listProspectPlaceIds,
  listProspects,
  saveProspect,
  saveProspectBatch,
  updateProspect,
} from '#/server/prospects'
import {
  clearGooglePlacesKey,
  getGooglePlacesPublicSettings,
  saveGooglePlacesKey,
  testGooglePlacesKey,
} from '#/server/google'
import {
  deleteAffiliateLead,
  getAffiliateLead,
  listAffiliateLeads,
  submitAffiliateLead,
  updateAffiliateLead,
} from '#/server/affiliate'
import {
  clearAffiliateWebhookUrl,
  getAffiliateWebhookPublicSettings,
  saveAffiliateWebhookUrl,
  testAffiliateWebhookUrl,
} from '#/server/affiliate-settings'
import { getCardDesign, saveCardDesign } from '#/server/card-design'
import { getPublicSiteFlags, saveSiteFlags } from '#/server/site'
import { getViewPrefs, saveViewPrefs } from '#/server/view-prefs'
import { lookupQr, markNfcEncoded } from '#/server/nfc'
import {
  deleteStockBatch,
  generateStockBatch,
  getBatchPrintData,
  listStockBatches,
} from '#/server/stock'
import { assertRateLimit } from '#/server/rate-limit'
import {
  getClientFingerprint,
  hashRateLimitIdentifier,
} from '#/server/request'
import { AFFILIATE_PLATFORM_KEYS } from '#/types/marketing'
import { servicePackageSchema } from '#/lib/review-settings'
import {
  getServicePackages,
  updateServicePackage,
} from '#/server/service-packages'
import {
  getPublicFeedbackCard,
  listUnitFeedback,
  resolveFeedbackDestination,
  retryFeedback,
  submitAnonymousFeedback,
  updateUnitReviewSettings,
} from '#/server/review'
import {
  getWhatsappGatewayStatus,
  isWhatsappGatewayOpen,
  queueWhatsappCommand,
  testWhatsapp,
} from '#/server/whatsapp'
import {
  requestEmailLoginOtp,
  requestLoginOtp,
  verifyEmailLoginOtp,
  verifyLoginOtp,
} from '#/server/otp-login'
import {
  getSmtpPublicSettings,
  isSmtpReady,
  saveSmtpSettings,
  testSmtp,
} from '#/server/smtp'
import { getOutboundLogSummary, listOutboundLogs } from '#/server/outbox'
import { getHolderNotifyStatus } from '#/server/holder-notify'
import {
  assignUnitToHolder,
  createHolder,
  getHolder,
  getHolderHandoff,
  listAssignableHolders,
  previewHandoff,
  listHolders,
  resetHolderPassword,
  resetHolderPin,
  setHolderStatus,
  unassignUnit,
  updateHolderProfile,
} from '#/server/users'

async function requirePermission(permission: Permission) {
  const owner = await requireOwner()
  const grants = await storedPermissions(owner.role)
  if (!grants.has(permission)) throw new Error('Unauthorized')
  return owner
}

async function requireAnyPermission(permissions: readonly Permission[]) {
  const owner = await requireOwner()
  const grants = await storedPermissions(owner.role)
  if (!permissions.some((permission) => grants.has(permission))) {
    throw new Error('Unauthorized')
  }
  return owner
}

async function requireOwner() {
  const owner = await getSessionOwner()
  if (!owner) throw new Error('Unauthorized')
  return owner
}

async function requireCard(unitId: string, mode: 'read' | 'manage') {
  const owner = await requireOwner()
  const grants = await storedPermissions(owner.role)
  const all = mode === 'read' ? 'cards.read.all' : 'cards.manage.all'
  const own = mode === 'read' ? 'cards.read.own' : 'cards.manage.own'
  if (grants.has(all)) return owner
  const unit = await getUnitDetail(unitId)
  if (!unit || !grants.has(own) || unit.holder?.id !== owner.ownerId) {
    throw new Error('Unauthorized')
  }
  return owner
}

async function requireUser() {
  const owner = await requireOwner()
  const grants = await storedPermissions(owner.role)
  if (grants.has('home.read')) throw new Error('Unauthorized')
  return owner
}

export const getCurrentOwnerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await getSessionOwner()
    return owner
      ? {
          email: owner.email,
          ownerId: owner.ownerId,
          name: owner.name,
          role: owner.role,
          hasPassword: owner.hasPassword,
          permissions: [...(await storedPermissions(owner.role))],
        }
      : null
  },
)

export const adminExistsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    return { exists: await adminExists() }
  },
)

export const getActivationCardFn = createServerFn({ method: 'GET' })
  .validator(z.object({ publicId: z.string().min(4).max(32) }))
  .handler(async ({ data }) => {
    const session = await getSessionOwner()
    return getActivationCardForViewer(data.publicId, session)
  })

const locSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
})

async function limitPlaces(publicId: string, pin?: string) {
  const card = await getActivationCard(publicId)
  if (!card) throw new Error('Kartu tidak ditemukan.')
  const session = await getSessionOwner()
  const mayRebind =
    card.status === 'ACTIVE' &&
    ((session && (await storedPermissions(session.role)).has('home.read')) ||
      (session?.role === 'USER' && session.ownerId === card.ownerId))
  if (card.status === 'IN_STOCK') {
    await verifyActivationAccess({
      publicId: card.publicId,
      pin,
      clientKey: getClientFingerprint(),
      sessionOwnerId: session?.ownerId ?? null,
      sessionRole: session?.role ?? null,
    })
  } else if (!mayRebind) {
    throw new Error('Kartu tidak tersedia untuk memilih toko.')
  }
  await assertRateLimit(`places-client:${getClientFingerprint()}`, {
    max: 40,
    windowMs: 60_000,
  })
  if (card.ownerId || mayRebind) {
    await assertRateLimit(
      `places-card:${hashRateLimitIdentifier(card.publicId)}`,
      { max: 200, windowMs: 15 * 60_000 },
    )
  }
}

export const placesStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const settings = await getGooglePlacesPublicSettings()
      return { configured: settings.configured }
    } catch {
      return { configured: false }
    }
  },
)

export const getGooglePlacesSettingsFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  await requirePermission('google.read')
  return getGooglePlacesPublicSettings()
})

export const saveGooglePlacesKeyFn = createServerFn({ method: 'POST' })
  .validator(z.object({ apiKey: z.string().trim().min(20).max(200) }))
  .handler(async ({ data }) => {
    await requirePermission('google.manage')
    await assertRateLimit(`google-key:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 15 * 60_000,
    })
    return saveGooglePlacesKey(data.apiKey)
  })

export const testGooglePlacesKeyFn = createServerFn({ method: 'POST' })
  .validator(z.object({ apiKey: z.string().max(200).optional() }))
  .handler(async ({ data }) => {
    await requirePermission('google.manage')
    await assertRateLimit(`google-key:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 15 * 60_000,
    })
    return testGooglePlacesKey(data.apiKey)
  })

export const clearGooglePlacesKeyFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    await requirePermission('google.manage')
    await assertRateLimit(`google-key:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 15 * 60_000,
    })
    return clearGooglePlacesKey()
  },
)

export const searchPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      query: z.string().min(2).max(200),
      publicId: z.string().min(4).max(32),
      loc: locSchema.optional(),
      sessionToken: z.string().uuid().optional(),
      pin: z.string().max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces(data.publicId, data.pin)
    return searchActivationPlaces(data)
  })

export const nearbyPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      loc: locSchema,
      pin: z.string().max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces(data.publicId, data.pin)
    return nearbyPlaces(data)
  })

export const placeDetailsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      placeId: z.string().min(2).max(256),
      publicId: z.string().min(4).max(32),
      sessionToken: z.string().uuid().optional(),
      pin: z.string().max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces(data.publicId, data.pin)
    return getPlaceDetails(data.placeId, data.sessionToken)
  })

export const rebindUnitOutletFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      placeId: z.string().min(2).max(256),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('cards.manage.all')
    return rebindUnitOutlet({
      ...data,
      actorOwnerId: owner.ownerId,
      asAdmin: true,
    })
  })

export const rebindMyUnitOutletFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      placeId: z.string().min(2).max(256),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requireUser()
    return rebindUnitOutlet({
      ...data,
      actorOwnerId: owner.ownerId,
    })
  })

export const verifyActivationAccessFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      pin: z.string().max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await getSessionOwner()
    return verifyActivationAccess({
      ...data,
      clientKey: getClientFingerprint(),
      sessionOwnerId: session?.ownerId ?? null,
      sessionRole: session?.role ?? null,
    })
  })

export const activateUnitFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      placeId: z.string().min(2).max(256),
      partnerRef: z.string().max(80).optional(),
      serviceTier: z.enum(['BASIC', 'PLUS', 'PRO']).optional(),
      reviewMode: z
        .enum(['GOOGLE_DIRECT', 'OWNER_WHATSAPP', 'ANONYMOUS_WHATSAPP'])
        .optional(),
      ownerWhatsapp: z.string().trim().max(32).optional(),
      pin: z.string().max(8).optional(),
      installKind: z.enum(['TRIAL', 'SOLD']).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await getSessionOwner()
    return activateUnit({
      ...data,
      clientKey: getClientFingerprint(),
      sessionOwnerId: session?.ownerId ?? null,
      sessionRole: session?.role ?? null,
    })
  })

export const getFeedbackCardFn = createServerFn({ method: 'GET' })
  .validator(z.object({ publicId: z.string().min(4).max(32) }))
  .handler(async ({ data }) => getPublicFeedbackCard(data.publicId))

export const resolveFeedbackDestinationFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      rating: z.number().int().min(1).max(5),
    }),
  )
  .handler(async ({ data }) => resolveFeedbackDestination(data))

export const submitAnonymousFeedbackFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      rating: z.number().int().min(1).max(5),
      message: z.string().trim().min(1).max(2000),
      submissionId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`feedback-client:${getClientFingerprint()}`, {
      max: 10,
      windowMs: 15 * 60_000,
    })
    await assertRateLimit(
      `feedback-card:${hashRateLimitIdentifier(data.publicId)}`,
      { max: 40, windowMs: 15 * 60_000 },
    )
    return submitAnonymousFeedback(data)
  })

export const otpLoginAvailableFn = createServerFn({ method: 'GET' }).handler(
  async () => ({
    whatsapp: await isWhatsappGatewayOpen(),
    email: await isSmtpReady(),
  }),
)

export const requestLoginOtpFn = createServerFn({ method: 'POST' })
  .validator(z.object({ whatsapp: z.string().trim().min(8).max(32) }))
  .handler(async ({ data }) => {
    await assertRateLimit(`otp-client:${getClientFingerprint()}`, {
      max: 8,
      windowMs: 15 * 60_000,
    })
    await assertRateLimit(
      `otp-wa:${hashRateLimitIdentifier(data.whatsapp)}`,
      { max: 5, windowMs: 15 * 60_000 },
    )
    return requestLoginOtp(data.whatsapp)
  })

export const verifyLoginOtpFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      whatsapp: z.string().trim().min(8).max(32),
      code: z.string().trim().min(4).max(8),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`otp-verify:${getClientFingerprint()}`, {
      max: 15,
      windowMs: 15 * 60_000,
    })
    return verifyLoginOtp(data.whatsapp, data.code)
  })

export const requestEmailLoginOtpFn = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().trim().email().max(254) }))
  .handler(async ({ data }) => {
    await assertRateLimit(`otp-email-client:${getClientFingerprint()}`, {
      max: 8,
      windowMs: 15 * 60_000,
    })
    await assertRateLimit(
      `otp-email:${hashRateLimitIdentifier(data.email)}`,
      { max: 5, windowMs: 15 * 60_000 },
    )
    return requestEmailLoginOtp(data.email)
  })

export const verifyEmailLoginOtpFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().trim().email().max(254),
      code: z.string().trim().min(4).max(8),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`otp-email-verify:${getClientFingerprint()}`, {
      max: 15,
      windowMs: 15 * 60_000,
    })
    return verifyEmailLoginOtp(data.email, data.code)
  })

export const getSmtpSettingsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('email.read')
    return getSmtpPublicSettings()
  },
)

export const saveSmtpSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      provider: z.enum(['smtp', 'resend']).optional(),
      host: z.string().trim().max(200).optional().or(z.literal('')),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      username: z.string().trim().max(200).optional().or(z.literal('')),
      password: z.string().max(400).optional().or(z.literal('')),
      fromName: z.string().trim().max(80).optional().or(z.literal('')),
      fromEmail: z.string().trim().max(254),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('email.manage')
    return saveSmtpSettings({
      ...data,
      host: data.host ?? '',
      username: data.username || undefined,
      password: data.password || undefined,
      fromName: data.fromName || undefined,
    })
  })

export const testSmtpFn = createServerFn({ method: 'POST' })
  .validator(z.object({ to: z.string().trim().email().max(254) }))
  .handler(async ({ data }) => {
    await requirePermission('email.manage')
    return testSmtp(data.to)
  })

export const listOutboundLogsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      channel: z.enum(['email', 'whatsapp']).optional(),
      page: z.coerce.number().int().min(1).max(500).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('logs.read')
    const [list, summary] = await Promise.all([
      listOutboundLogs(data),
      getOutboundLogSummary(),
    ])
    return { ...list, summary }
  })

export const loginPasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().trim().email().max(254),
      password: z.string().min(6).max(200),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`login-client:${getClientFingerprint()}`)
    await assertRateLimit(
      `login-account:${hashRateLimitIdentifier(data.email)}`,
      { max: 50, windowMs: 60 * 60_000 },
    )
    return loginWithPassword(data.email, data.password)
  })

export const registerPasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().trim().email().max(254),
      password: z.string().min(6).max(200),
      setupToken: z.string().min(1).max(512),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`register-client:${getClientFingerprint()}`, {
      max: 5,
      windowMs: 15 * 60_000,
    })
    return registerWithPassword(data.email, data.password, data.setupToken)
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  await destroyCurrentSession()
  return { ok: true }
})

export const getDashboardFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('home.read')
    return getAdminDashboardSummary()
  },
)

export const getUnitDetailFn = createServerFn({ method: 'GET' })
  .validator(z.object({ unitId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    if (!z.string().uuid().safeParse(data.unitId).success) return null
    const detail = await getUnitDetail(data.unitId)
    if (!detail) return null
    const grants = await storedPermissions(owner.role)
    if (!grants.has('cards.read.all') && detail.holder?.id !== owner.ownerId) {
      return null
    }
    return detail
  })

export const toggleUnitFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireCard(data.unitId, 'manage')
    return setUnitActiveState(data.unitId, data.active)
  })

const unitListSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['IN_STOCK', 'ACTIVE', 'INACTIVE']).optional(),
  ownership: z.enum(['unassigned', 'assigned']).optional(),
  partner: z.string().max(80).optional(),
  batchId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const listUnitsFn = createServerFn({ method: 'GET' })
  .validator(unitListSchema.optional())
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    const grants = await storedPermissions(owner.role)
    const seeAll = grants.has('cards.read.all')
    if (!seeAll && !grants.has('cards.read.own')) {
      throw new Error('Unauthorized')
    }
    return listUnits({
      ...(data ?? {}),
      ownerId: seeAll ? undefined : owner.ownerId,
      ownership: seeAll ? data?.ownership : undefined,
      batchId: seeAll ? data?.batchId : undefined,
    })
  })

export const updateUnitPartnerFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      partnerRef: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireCard(data.unitId, 'manage')
    return updateUnitPartner(data.unitId, data.partnerRef ?? null)
  })

export const getServicePackagesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('packages.read')
    return getServicePackages()
  },
)

export const updateServicePackageFn = createServerFn({ method: 'POST' })
  .validator(servicePackageSchema)
  .handler(async ({ data }) => {
    await requirePermission('packages.manage')
    return updateServicePackage(data)
  })

export const updateUnitReviewSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      serviceTier: z.enum(['BASIC', 'PLUS', 'PRO']),
      reviewMode: z
        .enum(['GOOGLE_DIRECT', 'OWNER_WHATSAPP', 'ANONYMOUS_WHATSAPP'])
        .optional(),
      ownerWhatsapp: z.string().trim().max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireCard(data.unitId, 'manage')
    return updateUnitReviewSettings(data)
  })

export const listUnitFeedbackFn = createServerFn({ method: 'GET' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireCard(data.unitId, 'read')
    return listUnitFeedback(data.unitId)
  })

export const retryFeedbackFn = createServerFn({ method: 'POST' })
  .validator(z.object({ feedbackId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('cards.manage.all')
    return { ok: await retryFeedback(data.feedbackId) }
  })

export const getWhatsappGatewayStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('whatsapp.read')
    return getWhatsappGatewayStatus()
  },
)

export const queueWhatsappCommandFn = createServerFn({ method: 'POST' })
  .validator(z.object({ command: z.enum(['CONNECT', 'RECONNECT', 'LOGOUT']) }))
  .handler(async ({ data }) => {
    await requirePermission('whatsapp.manage')
    return queueWhatsappCommand(data.command)
  })

export const testWhatsappFn = createServerFn({ method: 'POST' })
  .validator(z.object({ to: z.string().trim().min(8).max(32) }))
  .handler(async ({ data }) => {
    const owner = await requirePermission('whatsapp.manage')
    await assertRateLimit(`wa-test:${owner.ownerId}`, {
      max: 8,
      windowMs: 15 * 60_000,
    })
    return testWhatsapp(data.to)
  })

export const deleteUnitFn = createServerFn({ method: 'POST' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('cards.manage.all')
    return deleteUnit(data.unitId)
  })

export const resetUnitFn = createServerFn({ method: 'POST' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('cards.manage.all')
    return resetUnitToStock(data.unitId)
  })

export const generateStockFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      count: z.number().int().min(1).max(1000),
      label: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('stock.manage')
    assertAppUrlForProduction()
    const batch = await generateStockBatch(data)
    return {
      batchId: batch.batchId,
      label: batch.label,
      count: batch.units.length,
    }
  })

export const deleteStockBatchFn = createServerFn({ method: 'POST' })
  .validator(z.object({ batchId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('stock.manage')
    return deleteStockBatch(data.batchId)
  })

export const getAppUrlInfoFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAnyPermission(['home.read', 'stock.read'])
    return getAppUrlInfo()
  },
)

export const changePasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(6).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await getSessionOwner()
    if (!owner) throw new Error('Unauthorized')
    await assertRateLimit(
      `password:${hashRateLimitIdentifier(owner.ownerId)}`,
    )
    return changeOwnerPassword(
      owner.ownerId,
      data.currentPassword,
      data.newPassword,
    )
  })

export const listStockBatchesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await requireOwner()
    if (!(await storedPermissions(owner.role)).has('stock.read')) return []
    return listStockBatches()
  },
)

export const getBatchPrintFn = createServerFn({ method: 'POST' })
  .validator(z.object({ batchId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('stock.read')
    return getBatchPrintData(data)
  })

export const lookupQrFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ref: z.string().min(4).max(500) }))
  .handler(async ({ data }) => {
    await requirePermission('stock.manage')
    return lookupQr(data.ref)
  })

export const markNfcEncodedFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ref: z.string().min(4).max(200) }))
  .handler(async ({ data }) => {
    await requirePermission('stock.manage')
    assertAppUrlForProduction()
    return markNfcEncoded(data.ref)
  })

const affiliateLeadInputSchema = z.object({
  nama: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  whatsapp: z.string().trim().min(9).max(32),
  platforms: z.array(z.enum(AFFILIATE_PLATFORM_KEYS)).min(1).max(6),
  usernames: z
    .record(z.enum(AFFILIATE_PLATFORM_KEYS), z.string().trim().max(100))
    .optional(),
}).strict()

export const submitAffiliateLeadFn = createServerFn({ method: 'POST' })
  .validator(affiliateLeadInputSchema)
  .handler(async ({ data }) => {
    try {
      await assertRateLimit(`affiliate-client:${getClientFingerprint()}`, {
        max: 8,
        windowMs: 15 * 60 * 1000,
      })
      await assertRateLimit(
        `affiliate-email:${hashRateLimitIdentifier(data.email)}`,
        { max: 5, windowMs: 24 * 60 * 60 * 1000 },
      )
    } catch (err) {
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
        fields: {},
      }
    }

    return submitAffiliateLead(data)
  })

const affiliateListSchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const getPublicSiteFlagsFn = createServerFn({ method: 'GET' }).handler(
  async () => getPublicSiteFlags(),
)

export const getSiteSettingsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('site.read')
    return getPublicSiteFlags()
  },
)

export const saveSiteSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      homeEnabled: z.boolean(),
      affiliateEnabled: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('site.manage')
    await assertRateLimit(`site-flags:${getClientFingerprint()}`, {
      max: 40,
      windowMs: 15 * 60_000,
    })
    return saveSiteFlags(data)
  })

export const getCardDesignFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('card.design.read')
    return getCardDesign()
  },
)

export const saveCardDesignFn = createServerFn({ method: 'POST' })
  .validator(cardDesignSchema)
  .handler(async ({ data }) => {
    await requirePermission('card.design.manage')
    await assertRateLimit(`card-design:${getClientFingerprint()}`, {
      max: 40,
      windowMs: 15 * 60_000,
    })
    return saveCardDesign(data)
  })

const viewPrefsPayloadSchema = z.object({
  view: z.enum(['stock', 'units']),
  columns: z.array(z.string().max(40)).max(32).optional(),
  density: z.enum(['compact', 'normal']).optional(),
  mode: z.enum(['list', 'table']).optional(),
})

export const getViewPrefsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ view: z.enum(['stock', 'units']) }))
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    return getViewPrefs(owner.ownerId, data.view)
  })

export const saveViewPrefsFn = createServerFn({ method: 'POST' })
  .validator(viewPrefsPayloadSchema)
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    await assertRateLimit(`view-prefs:${getClientFingerprint()}`, {
      max: 60,
      windowMs: 15 * 60_000,
    })
    const { view, ...prefs } = data
    return saveViewPrefs(owner.ownerId, view, prefs)
  })

export const getAffiliateWebhookSettingsFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  await requirePermission('affiliate.read')
  return getAffiliateWebhookPublicSettings()
})

export const saveAffiliateWebhookUrlFn = createServerFn({ method: 'POST' })
  .validator(z.object({ url: z.string().trim().min(8).max(500) }))
  .handler(async ({ data }) => {
    await requirePermission('affiliate.manage')
    await assertRateLimit(`affiliate-webhook:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 15 * 60_000,
    })
    return saveAffiliateWebhookUrl(data.url)
  })

export const testAffiliateWebhookUrlFn = createServerFn({ method: 'POST' })
  .validator(z.object({ url: z.string().max(500).optional() }))
  .handler(async ({ data }) => {
    await requirePermission('affiliate.manage')
    await assertRateLimit(`affiliate-webhook:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 15 * 60_000,
    })
    return testAffiliateWebhookUrl(data.url)
  })

export const clearAffiliateWebhookUrlFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  await requirePermission('affiliate.manage')
  await assertRateLimit(`affiliate-webhook:${getClientFingerprint()}`, {
    max: 20,
    windowMs: 15 * 60_000,
  })
  return clearAffiliateWebhookUrl()
})

export const listAffiliateLeadsFn = createServerFn({ method: 'GET' })
  .validator(affiliateListSchema.optional())
  .handler(async ({ data }) => {
    await requirePermission('affiliate.read')
    return listAffiliateLeads(data ?? {})
  })

export const getAffiliateLeadFn = createServerFn({ method: 'GET' })
  .validator(z.object({ leadId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requirePermission('affiliate.read')
    if (!z.string().uuid().safeParse(data.leadId).success) return null
    return getAffiliateLead(data.leadId)
  })

export const updateAffiliateLeadFn = createServerFn({ method: 'POST' })
  .validator(
    affiliateLeadInputSchema.extend({
      leadId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('affiliate.manage')
    const { leadId, ...body } = data
    return updateAffiliateLead(leadId, body)
  })

export const deleteAffiliateLeadFn = createServerFn({ method: 'POST' })
  .validator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('affiliate.manage')
    return deleteAffiliateLead(data.leadId)
  })

export const listHoldersFn = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        q: z.string().max(200).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.read')
    return listHolders({ ...(data ?? {}), actorRole: owner.role })
  })

export const listAssignableHoldersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await requireOwner()
    if (!(await storedPermissions(owner.role)).has('holders.read')) return []
    return listAssignableHolders()
  },
)

export const getHolderFn = createServerFn({ method: 'GET' })
  .validator(z.object({ userId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.read')
    if (!z.string().uuid().safeParse(data.userId).success) return null
    return getHolder(data.userId, owner.role)
  })

export const getHolderNotifyStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('holders.read')
    return getHolderNotifyStatus()
  },
)

export const createHolderFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().trim().email().max(254).optional().or(z.literal('')),
      password: z.string().max(200).optional().or(z.literal('')),
      whatsapp: z.string().trim().max(32).optional().or(z.literal('')),
      name: z.string().trim().max(80).optional(),
      pin: z.string().max(8).optional(),
      role: z.string().trim().min(2).max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.manage')
    return createHolder(
      {
        email: data.email || undefined,
        password: data.password || undefined,
        whatsapp: data.whatsapp || undefined,
        name: data.name,
        pin: data.pin,
        role: data.role,
      },
      owner,
    )
  })

export const setHolderStatusFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      status: z.enum(['ACTIVE', 'DISABLED']),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.manage')
    return setHolderStatus(data.userId, data.status, owner)
  })

export const resetHolderPinFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      pin: z.string().max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.manage')
    return resetHolderPin(data.userId, data.pin, owner)
  })

export const resetHolderPasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(6).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.manage')
    return resetHolderPassword(data.userId, data.password, owner)
  })

export const updateHolderProfileFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      name: z.string().trim().max(80).optional(),
      whatsapp: z.string().trim().max(32).optional().or(z.literal('')),
      role: z.string().trim().min(2).max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('holders.manage')
    return updateHolderProfile(
      data.userId,
      {
        name: data.name,
        whatsapp: data.whatsapp,
        role: data.role,
      },
      owner,
    )
  })

export const getHolderHandoffFn = createServerFn({ method: 'GET' })
  .validator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('holders.read')
    return getHolderHandoff(data.userId)
  })

export const previewHandoffFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ref: z.string().trim().min(4).max(400) }))
  .handler(async ({ data }) => {
    await requirePermission('holders.manage')
    return previewHandoff(data.ref)
  })

export const assignUnitToHolderFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ownerId: z.string().uuid(),
      unitId: z.string().uuid().optional(),
      publicId: z.string().min(4).max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('holders.manage')
    return assignUnitToHolder(data)
  })

export const unassignUnitFn = createServerFn({ method: 'POST' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requirePermission('holders.manage')
    return unassignUnit(data.unitId)
  })

export const listMyUnitsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await requireUser()
    const holder = await getHolder(owner.ownerId)
    return holder
  },
)

export const getMyUnitDetailFn = createServerFn({ method: 'GET' })
  .validator(z.object({ unitId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const owner = await requireUser()
    if (!z.string().uuid().safeParse(data.unitId).success) return null
    const detail = await getUnitDetail(data.unitId)
    if (!detail || detail.holder?.id !== owner.ownerId) return null
    return detail
  })

export const activateMyUnitFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      placeId: z.string().min(2).max(256),
      serviceTier: z.enum(['BASIC', 'PLUS', 'PRO']).optional(),
      reviewMode: z
        .enum(['GOOGLE_DIRECT', 'OWNER_WHATSAPP', 'ANONYMOUS_WHATSAPP'])
        .optional(),
      ownerWhatsapp: z.string().trim().max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requireUser()
    return activateUnit({
      ...data,
      sessionOwnerId: owner.ownerId,
      sessionRole: owner.role,
      clientKey: getClientFingerprint(),
    })
  })

export const updateMyUnitReviewSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      ownerWhatsapp: z.string().trim().max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requireUser()
    const detail = await getUnitDetail(data.unitId)
    if (!detail || detail.holder?.id !== owner.ownerId) {
      throw new Error('Kartu tidak ditemukan.')
    }
    return updateUnitReviewSettings({
      unitId: data.unitId,
      serviceTier: detail.serviceTier,
      ownerWhatsapp: data.ownerWhatsapp,
    })
  })

const prospectCategorySchema = z.enum([
  'kopi',
  'makan',
  'toko',
  'salon',
  'klinik',
  'semua',
])

export const prospectNearbyPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      loc: locSchema,
      category: prospectCategorySchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-places:${getClientFingerprint()}`, {
      max: 40,
      windowMs: 60_000,
    })
    const category = data.category ?? 'semua'
    const includedTypes = [...PROSPECT_CATEGORIES[category].types]
    return nearbyPlaces({
      loc: data.loc,
      includedTypes: includedTypes.length > 0 ? includedTypes : undefined,
      signals: true,
    })
  })

export const scanCityProspectsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      city: z.string().trim().min(2).max(80),
      category: prospectCategorySchema.optional(),
      potentialOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-city:${getClientFingerprint()}`, {
      max: 12,
      windowMs: 15 * 60_000,
    })
    return scanCityPlaces(data)
  })

export const saveProspectBatchFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      places: z
        .array(
          z.object({
            placeId: z.string().min(2).max(256),
            name: z.string().trim().min(1).max(200),
            address: z.string().max(300).nullable(),
            description: z.string().max(500),
            rating: z.number().min(0).max(5).nullable(),
            userRatingCount: z.number().int().min(0).nullable(),
            googleMapsUri: z.string().max(500).nullable(),
            primaryType: z.string().max(80).nullable(),
          }),
        )
        .min(1)
        .max(80),
      notes: z.string().max(500).optional(),
      partnerRef: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-batch:${getClientFingerprint()}`, {
      max: 8,
      windowMs: 15 * 60_000,
    })
    return saveProspectBatch({
      places: data.places,
      notes: data.notes,
      partnerRef: data.partnerRef,
      createdByOwnerId: owner.ownerId,
    })
  })

export const prospectSearchPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      query: z.string().min(2).max(200),
      loc: locSchema.optional(),
      category: prospectCategorySchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-places:${getClientFingerprint()}`, {
      max: 40,
      windowMs: 60_000,
    })
    return textSearchPlacesPaged({
      query: data.query,
      loc: data.loc,
    })
  })

export const saveProspectFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      placeId: z.string().min(2).max(256),
      notes: z.string().max(500).optional(),
      partnerRef: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-save:${getClientFingerprint()}`, {
      max: 40,
      windowMs: 15 * 60_000,
    })
    return saveProspect({
      ...data,
      createdByOwnerId: owner.ownerId,
    })
  })

export const listProspectsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      q: z.string().max(120).optional(),
      status: z.enum(['NEW', 'CONTACTED', 'WON', 'LOST']).optional(),
      install: z.enum(['none', 'trial', 'due', 'collected', 'sold']).optional(),
      partner: z.string().max(80).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sort: z.enum(['reviews', 'rating', 'recent', 'pickup']).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    return listProspects({ ...data, ownerId: owner.ownerId })
  })

export const listProspectPlaceIdsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await requirePermission('prospects.manage.own')
    return listProspectPlaceIds(owner.ownerId)
  },
)

export const updateProspectFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['NEW', 'CONTACTED', 'WON', 'LOST']).optional(),
      notes: z.string().max(500).optional(),
      partnerRef: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    return updateProspect({ ...data, ownerId: owner.ownerId })
  })

export const deleteProspectsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    return deleteProspects(data.ids, owner.ownerId)
  })

export const deleteProspectFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    return deleteProspect(data.id, owner.ownerId)
  })

export const collectProspectTrialFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-collect:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 60 * 60_000,
    })
    const grants = await storedPermissions(owner.role)
    return collectProspectTrial(data.id, owner.ownerId, {
      manageAll: grants.has('cards.manage.all'),
    })
  })

export const convertProspectToSoldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const owner = await requirePermission('prospects.manage.own')
    await assertRateLimit(`prospect-close:${getClientFingerprint()}`, {
      max: 20,
      windowMs: 60 * 60_000,
    })
    const grants = await storedPermissions(owner.role)
    return convertProspectToSold(data.id, new Date(), owner.ownerId, {
      manageAll: grants.has('cards.manage.all'),
    })
  })

export const listRoleGrantsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePermission('access.manage')
    return listRoles()
  },
)

export const saveRoleGrantsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      role: z.string().trim().min(2).max(32),
      name: z.string().trim().min(2).max(40).optional(),
      permissions: z.array(z.string()).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requirePermission('access.manage')
    return saveRoleGrants({
      role: data.role,
      name: data.name,
      permissions: data.permissions,
      actorRole: owner.role,
    })
  })

export const createRoleFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(2).max(40) }))
  .handler(async ({ data }) => {
    await requirePermission('access.manage')
    return createRole(data.name)
  })

export const deleteRoleFn = createServerFn({ method: 'POST' })
  .validator(z.object({ key: z.string().trim().min(2).max(32) }))
  .handler(async ({ data }) => {
    await requirePermission('access.manage')
    return deleteRole(data.key)
  })
