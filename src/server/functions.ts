import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { activateUnit, getActivationCard } from '#/server/activation'
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

function clientIp() {
  try {
    const forwarded = getRequestHeader('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
    return getRequestHeader('x-real-ip') ?? null
  } catch {
    return null
  }
}

async function requireAdmin() {
  const owner = await getSessionOwner()
  if (!owner) throw new Error('Unauthorized')
  return owner
}

export const getCurrentOwnerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await getSessionOwner()
    return owner
      ? {
          email: owner.email,
          ownerId: owner.ownerId,
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

async function limitPlaces() {
  await assertRateLimit(`places:${clientIp() ?? 'unknown'}`, {
    max: 40,
    windowMs: 60_000,
  })
}

export const placesStatusFn = createServerFn({ method: 'GET' }).handler(
  async () => ({ configured: isGooglePlacesConfigured() }),
)

export const searchPlacesFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      query: z.string().min(2).max(200),
      loc: locSchema.optional(),
      sessionToken: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces()
    return autocompletePlaces(data)
  })

export const nearbyPlacesFn = createServerFn({ method: 'POST' })
  .validator(z.object({ loc: locSchema }))
  .handler(async ({ data }) => {
    await limitPlaces()
    return nearbyPlaces(data)
  })

export const placeDetailsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      placeId: z.string().min(2).max(256),
      sessionToken: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await limitPlaces()
    return getPlaceDetails(data.placeId, data.sessionToken)
  })

export const activateUnitFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      publicId: z.string().min(4).max(32),
      placeId: z.string().min(2),
      partnerRef: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    return activateUnit({
      ...data,
      ip: clientIp(),
    })
  })

export const loginPasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`login:${clientIp() ?? 'unknown'}`)
    return loginWithPassword(data.email, data.password)
  })

export const registerPasswordFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    await assertRateLimit(`register:${clientIp() ?? 'unknown'}`)
    return registerWithPassword(data.email, data.password)
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
      newPassword: z.string().min(8).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const owner = await requireAdmin()
    await assertRateLimit(`password:${owner.ownerId}`)
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
  nama: z.string(),
  email: z.string(),
  whatsapp: z.string(),
  platforms: z.array(z.string()),
  usernames: z.record(z.string(), z.string()).optional(),
})

export const submitAffiliateLeadFn = createServerFn({ method: 'POST' })
  .validator(affiliateLeadInputSchema)
  .handler(async ({ data }) => {
    try {
      await assertRateLimit(`affiliate:${clientIp() ?? 'unknown'}`, {
        max: 8,
        windowMs: 15 * 60 * 1000,
      })
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
