import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  activateUnit,
  getActivationCard,
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
import { assertAppUrlForProduction, getAppUrlInfo } from '#/lib/env'
import {
  deleteUnit,
  getAdminDashboardSummary,
  getUnitDetail,
  listUnits,
  setUnitActiveState,
  updateUnitPartner,
} from '#/server/clicks'
import {
  autocompletePlaces,
  getPlaceDetails,
  isGooglePlacesConfigured,
  nearbyPlaces,
} from '#/server/places'
import {
  deleteAffiliateLead,
  getAffiliateLead,
  listAffiliateLeads,
  submitAffiliateLead,
  updateAffiliateLead,
} from '#/server/affiliate'
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
  listAssignableHolders,
  listHolders,
  resetHolderPassword,
  resetHolderPin,
  setHolderStatus,
  unassignUnit,
  updateHolderProfile,
} from '#/server/users'

async function requireAdmin() {
  const owner = await getSessionOwner()
  if (!owner || owner.role !== 'ADMIN') throw new Error('Unauthorized')
  return owner
}

async function requireUser() {
  const owner = await getSessionOwner()
  if (!owner || owner.role !== 'USER') throw new Error('Unauthorized')
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
    return getActivationCard(data.publicId)
  })

const locSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
})

async function limitPlaces(publicId: string) {
  const card = await getActivationCard(publicId)
  if (!card) throw new Error('Kartu tidak ditemukan.')
  const session = await getSessionOwner()
  const mayRebind =
    card.status === 'ACTIVE' &&
    (session?.role === 'ADMIN' ||
      (session?.role === 'USER' && session.ownerId === card.ownerId))
  if (card.status !== 'IN_STOCK' && !mayRebind) {
    throw new Error('Kartu tidak tersedia untuk memilih toko.')
  }
  await assertRateLimit(`places-client:${getClientFingerprint()}`, {
    max: 40,
    windowMs: 60_000,
  })
  await assertRateLimit(
    `places-card:${hashRateLimitIdentifier(card.publicId)}`,
    { max: 200, windowMs: 15 * 60_000 },
  )
}

export const placesStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => ({ configured: isGooglePlacesConfigured() }),
)

export const searchPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      query: z.string().min(2).max(200),
      publicId: z.string().min(4).max(32),
      loc: locSchema.optional(),
      sessionToken: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces(data.publicId)
    return autocompletePlaces(data)
  })

export const nearbyPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ publicId: z.string().min(4).max(32), loc: locSchema }),
  )
  .handler(async ({ data }) => {
    await limitPlaces(data.publicId)
    return nearbyPlaces(data)
  })

export const placeDetailsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      placeId: z.string().min(2).max(256),
      publicId: z.string().min(4).max(32),
      sessionToken: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces(data.publicId)
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
    await requireAdmin()
    return rebindUnitOutlet({ ...data, asAdmin: true })
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
    return getAdminDashboardSummary()
  },
)

export const getUnitDetailFn = createServerFn({ method: 'GET' })
  .validator(z.object({ unitId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!z.string().uuid().safeParse(data.unitId).success) return null
    return getUnitDetail(data.unitId)
  })

export const toggleUnitFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return setUnitActiveState(data.unitId, data.active)
  })

const unitListSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['IN_STOCK', 'ACTIVE', 'INACTIVE']).optional(),
  partner: z.string().max(80).optional(),
  batchId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const listUnitsFn = createServerFn({ method: 'GET' })
  .validator(unitListSchema.optional())
  .handler(async ({ data }) => {
    await requireAdmin()
    return listUnits(data ?? {})
  })

export const updateUnitPartnerFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      unitId: z.string().uuid(),
      partnerRef: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return updateUnitPartner(data.unitId, data.partnerRef ?? null)
  })

export const getServicePackagesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin()
    return getServicePackages()
  },
)

export const updateServicePackageFn = createServerFn({ method: 'POST' })
  .validator(servicePackageSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
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
    await requireAdmin()
    return updateUnitReviewSettings(data)
  })

export const listUnitFeedbackFn = createServerFn({ method: 'GET' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return listUnitFeedback(data.unitId)
  })

export const retryFeedbackFn = createServerFn({ method: 'POST' })
  .validator(z.object({ feedbackId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return { ok: await retryFeedback(data.feedbackId) }
  })

export const getWhatsappGatewayStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin()
    return getWhatsappGatewayStatus()
  },
)

export const queueWhatsappCommandFn = createServerFn({ method: 'POST' })
  .validator(z.object({ command: z.enum(['CONNECT', 'RECONNECT', 'LOGOUT']) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return queueWhatsappCommand(data.command)
  })

export const testWhatsappFn = createServerFn({ method: 'POST' })
  .validator(z.object({ to: z.string().trim().min(8).max(32) }))
  .handler(async ({ data }) => {
    const owner = await requireAdmin()
    await assertRateLimit(`wa-test:${owner.ownerId}`, {
      max: 8,
      windowMs: 15 * 60_000,
    })
    return testWhatsapp(data.to)
  })

export const deleteUnitFn = createServerFn({ method: 'POST' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return deleteUnit(data.unitId)
  })

export const generateStockFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      count: z.number().int().min(1).max(1000),
      label: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
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
    await requireAdmin()
    return deleteStockBatch(data.batchId)
  })

export const getAppUrlInfoFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin()
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
    await requireAdmin()
    return listStockBatches()
  },
)

export const getBatchPrintFn = createServerFn({ method: 'POST' })
  .validator(z.object({ batchId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return getBatchPrintData(data)
  })

export const lookupQrFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ref: z.string().min(4).max(500) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return lookupQr(data.ref)
  })

export const markNfcEncodedFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ref: z.string().min(4).max(200) }))
  .handler(async ({ data }) => {
    await requireAdmin()
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

export const listAffiliateLeadsFn = createServerFn({ method: 'GET' })
  .validator(affiliateListSchema.optional())
  .handler(async ({ data }) => {
    await requireAdmin()
    return listAffiliateLeads(data ?? {})
  })

export const getAffiliateLeadFn = createServerFn({ method: 'GET' })
  .validator(z.object({ leadId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requireAdmin()
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
    await requireAdmin()
    const { leadId, ...body } = data
    return updateAffiliateLead(leadId, body)
  })

export const deleteAffiliateLeadFn = createServerFn({ method: 'POST' })
  .validator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
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
    await requireAdmin()
    return listHolders(data ?? {})
  })

export const listAssignableHoldersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin()
    return listAssignableHolders()
  },
)

export const getHolderFn = createServerFn({ method: 'GET' })
  .validator(z.object({ userId: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!z.string().uuid().safeParse(data.userId).success) return null
    return getHolder(data.userId)
  })

export const getHolderNotifyStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin()
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
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return createHolder({
      email: data.email || undefined,
      password: data.password || undefined,
      whatsapp: data.whatsapp || undefined,
      name: data.name,
      pin: data.pin,
    })
  })

export const setHolderStatusFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      status: z.enum(['ACTIVE', 'DISABLED']),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return setHolderStatus(data.userId, data.status)
  })

export const resetHolderPinFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      pin: z.string().max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return resetHolderPin(data.userId, data.pin)
  })

export const resetHolderPasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(6).max(200),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return resetHolderPassword(data.userId, data.password)
  })

export const updateHolderProfileFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().uuid(),
      name: z.string().trim().max(80).optional(),
      whatsapp: z.string().trim().max(32).optional().or(z.literal('')),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    return updateHolderProfile(data.userId, {
      name: data.name,
      whatsapp: data.whatsapp,
    })
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
    await requireAdmin()
    return assignUnitToHolder(data)
  })

export const unassignUnitFn = createServerFn({ method: 'POST' })
  .validator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
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
