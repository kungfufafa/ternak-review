import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

// Deterministic gate: stub Places unless SMOKE_LIVE_PLACES=1.
if (process.env.CI || process.env.SMOKE_LIVE_PLACES !== '1') {
  process.env.GOOGLE_MAPS_API_KEY = ''
}
if (process.env.SMOKE_USE_APP_DB !== '1') {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'review-smoke-')), 'smoke.db')}`
}

import {
  deleteStockBatch,
  generateStockBatch,
  getBatchPrintData,
  listStockBatches,
} from '../src/server/stock.ts'
import { buildPrintPdf } from '../src/lib/card-pdf.ts'
import { serializeMobileBatch } from '../src/server/mobile-stock.ts'
import {
  clearGooglePlacesKey,
  getGooglePlacesPublicSettings,
  resolveGoogleMapsApiKey,
  saveGooglePlacesKey,
} from '../src/server/google.ts'
import {
  clearAffiliateWebhookUrl,
  getAffiliateWebhookPublicSettings,
  normalizeAffiliateWebhookUrl,
  resolveAffiliateWebhookUrl,
  saveAffiliateWebhookUrl,
} from '../src/server/affiliate-settings.ts'
import {
  getPublicSiteFlags,
  isActivationPinEnabled,
  saveActivationPinEnabled,
  saveSiteFlags,
} from '../src/server/site.ts'
import { submitAffiliateLead } from '../src/server/affiliate.ts'
import {
  mobileBatchIdSchema,
  mobileGenerateSchema,
  mobileLoginSchema,
  mobileRefSchema,
} from '../src/server/mobile-api.ts'
import { markNfcEncoded } from '../src/server/nfc.ts'
import {
  activateUnit,
  attachPlaceToCard,
  collectProspectTrial,
  convertProspectToSold,
  getActivationCard,
  getActivationCardForViewer,
  rebindUnitOutlet,
  verifyActivationAccess,
} from '../src/server/activation.ts'
import {
  assignUnitToHolder,
  createHolder,
  getHolder,
  resetHolderPin,
  setHolderStatus,
} from '../src/server/users.ts'
import { resolveRedirect, logClick } from '../src/server/redirect.ts'
import {
  getPublicFeedbackCard,
  listUnitFeedback,
  resolveFeedbackDestination,
  retryFeedback,
  submitAnonymousFeedback,
  updateUnitReviewSettings,
} from '../src/server/review.ts'
import { DEFAULT_SERVICE_PACKAGES } from '../src/lib/review-settings.ts'
import {
  getServicePackage,
  getServicePackages,
  updateServicePackage,
} from '../src/server/service-packages.ts'
import {
  getWhatsappGatewayStatus,
  isWhatsappGatewayOpen,
  pollWhatsappGateway,
  queueWhatsappCommand,
  reportWhatsappGateway,
  testWhatsapp,
} from '../src/server/whatsapp.ts'
import {
  requestEmailLoginOtp,
  requestLoginOtp,
  verifyLoginOtp,
} from '../src/server/otp-login.ts'
import { isSmtpReady, saveSmtpSettings, sendAppEmail } from '../src/server/smtp.ts'
import { listOutboundLogs } from '../src/server/outbox.ts'
import {
  activationNameSearchBody,
  autocompletePlaces,
  getPlaceDetails,
  nearbyPlaces,
  nearbySearchBody,
  scanCityPlaces,
  searchActivationPlaces,
  textSearchPlaces,
} from '../src/server/places.ts'
import {
  ACTIVATION_NAME_SEARCH_PAGE_SIZE,
  ACTIVATION_NEARBY_RADIUS_M,
  ACTIVATION_SEARCH_BIAS_RADIUS_M,
  activationLookup,
  CIREBON_CENTER,
  distanceMeters,
  ES_TEH_JOMBLO_KEDUNGJAYA,
  isEsTehJombloKedungjaya,
  parseGooglePlaceId,
  PHONE_OUTSIDE_CIREBON,
} from '../src/lib/activation-places.ts'
import {
  closingBand,
  closingHint,
  DEFAULT_TRIAL_DAYS,
  formatPlaceRating,
  isPotentialProspect,
  prospectInstallState,
  trialPickupLabel,
} from '../src/lib/place-rating.ts'
import {
  deleteProspect,
  listProspectInstalls,
  listProspects,
  saveProspect,
  saveProspectBatch,
} from '../src/server/prospects.ts'
import { eq, or } from 'drizzle-orm'
import { db } from '../src/db/index.ts'
import { outlets, prospects, reviewFeedbacks, units, whatsappCommands, whatsappGatewayState, whatsappOutbox } from '../src/db/schema.ts'
import {
  deleteUnit,
  getAdminDashboardSummary,
  getUnitDetail,
  listUnits,
  resetUnitToStock,
  setUnitActiveState,
  summarizeClickBuckets,
} from '../src/server/clicks.ts'

async function expectReject(run: () => Promise<unknown>, label: string) {
  try {
    await run()
  } catch {
    return
  }
  throw new Error(`${label} must be rejected`)
}

async function setSmokeGateway(status: 'OPEN' | 'OFFLINE') {
  const now = new Date()
  const lastHeartbeatAt =
    status === 'OPEN' ? now : new Date(now.getTime() - 120_000)
  await db
    .insert(whatsappGatewayState)
    .values({
      id: 'primary',
      status,
      lastHeartbeatAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: whatsappGatewayState.id,
      set: { status, lastHeartbeatAt, updatedAt: now },
    })
}

async function checkServicePackages(unitId: string, publicId: string) {
  await setSmokeGateway('OPEN')
  const modes = [
    { serviceTier: 'PLUS' as const, kind: 'owner_whatsapp' as const },
    { serviceTier: 'PRO' as const, kind: 'anonymous' as const },
  ]

  for (const { serviceTier, kind } of modes) {
    const name = serviceTier === 'PLUS' ? 'Pendamping' : 'Masukan Privat'
    const saved = await updateServicePackage({
      serviceTier,
      name: `  ${name}  `,
      interceptMaxRating: 2,
    })
    const persisted = await getServicePackage(serviceTier)
    if (saved.name !== name || persisted.name !== name || persisted.interceptMaxRating !== 2) {
      throw new Error('Package names must be trimmed and configuration must persist')
    }
    await updateUnitReviewSettings({
      unitId,
      serviceTier,
      ownerWhatsapp: '081234567890',
    })
    const activation = await getActivationCard(publicId)
    const detail = await getUnitDetail(unitId)
    if (
      activation?.servicePackage.name !== name ||
      detail?.servicePackages.find((item) => item.serviceTier === serviceTier)?.name !== name
    ) {
      throw new Error('Custom package names must reach activation and admin card detail')
    }
    if ((await resolveRedirect(publicId)).kind !== 'feedback') {
      throw new Error('Intercept modes must open the rating page')
    }

    for (const interceptMaxRating of [2, 1, 5]) {
      await updateServicePackage({ serviceTier, name, interceptMaxRating })
      const card = await getPublicFeedbackCard(publicId)
      if (card?.interceptMaxRating !== interceptMaxRating) {
        throw new Error('Existing public cards must read the current package threshold')
      }
      for (let rating = 1; rating <= 5; rating++) {
        const destination = await resolveFeedbackDestination({ publicId, rating })
        const expected = rating <= interceptMaxRating ? kind : 'google'
        if (destination.kind !== expected) {
          throw new Error(`${serviceTier}: rating ${rating} at threshold ${interceptMaxRating} must resolve to ${expected}`)
        }
      }
      if (kind === 'anonymous') {
        const submissionId = crypto.randomUUID()
        await submitAnonymousFeedback({
          publicId,
          rating: interceptMaxRating,
          message: `Threshold ${interceptMaxRating} feedback`,
          submissionId,
        })
        const submitted = (await listUnitFeedback(unitId)).find((row) => row.id === submissionId)
        if (submitted?.rating !== interceptMaxRating || submitted.status !== 'QUEUED') {
          throw new Error('Anonymous feedback at every configured boundary must be queued')
        }
        if (interceptMaxRating < 5) {
          await expectReject(
            () => submitAnonymousFeedback({
              publicId,
              rating: interceptMaxRating + 1,
              message: 'Above the configured threshold',
              submissionId: crypto.randomUUID(),
            }),
            'Anonymous feedback above the package threshold',
          )
        }
      }
    }
  }

  // A visitor who opened the form at threshold 5 must obey a newer threshold.
  const previousCard = await getPublicFeedbackCard(publicId)
  if (previousCard?.interceptMaxRating !== 5) {
    throw new Error('Expected a previously loaded anonymous card at threshold 5')
  }
  await updateServicePackage({ serviceTier: 'PRO', name: 'Privat Baru', interceptMaxRating: 1 })
  const beforeRejected = (await listUnitFeedback(unitId)).length
  for (const rating of [2, 5, 0, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expectReject(
      () => submitAnonymousFeedback({
        publicId,
        rating,
        message: 'Stale or invalid rating',
        submissionId: crypto.randomUUID(),
      }),
      `Anonymous rating ${rating} after the threshold changes to 1`,
    )
  }
  if ((await listUnitFeedback(unitId)).length !== beforeRejected) {
    throw new Error('Rejected anonymous submissions must not enter the feedback queue')
  }
  const renamed = await getActivationCard(publicId)
  if (renamed?.servicePackage.name !== 'Privat Baru') {
    throw new Error('Renaming a package must immediately update existing cards')
  }
  for (const rating of [0, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expectReject(
      () => resolveFeedbackDestination({ publicId, rating }),
      `Invalid rating ${rating}`,
    )
  }

  const validPackage = await getServicePackage('PLUS')
  for (const name of ['', '   ', 'x'.repeat(41)]) {
    await expectReject(
      () => updateServicePackage({ ...validPackage, name }),
      'Invalid package name',
    )
  }
  for (const interceptMaxRating of [0, -1, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expectReject(
      () => updateServicePackage({ ...validPackage, interceptMaxRating }),
      `Invalid package threshold ${interceptMaxRating}`,
    )
  }
  const afterInvalid = await getServicePackage('PLUS')
  if (afterInvalid.name !== validPackage.name || afterInvalid.interceptMaxRating !== validPackage.interceptMaxRating) {
    throw new Error('Rejected package updates must preserve the saved configuration')
  }
  const basic = await getServicePackage('BASIC')
  if (basic.interceptMaxRating !== 0) {
    throw new Error('Basic package must always use the direct-review threshold')
  }
  await expectReject(
    () => updateServicePackage({ ...basic, interceptMaxRating: 1 }),
    'Enabling interception for Basic',
  )
  await updateServicePackage({
    serviceTier: 'BASIC',
    name: 'Standar',
    interceptMaxRating: 0,
  })
  if ((await getServicePackage('BASIC')).name !== 'Standar') {
    throw new Error('Basic package name must be configurable')
  }

  const basicSettings = await updateUnitReviewSettings({
    unitId,
    serviceTier: 'BASIC',
    ownerWhatsapp: '081234567890',
  })
  if (
    !basicSettings.ok ||
    basicSettings.reviewMode !== 'GOOGLE_DIRECT' ||
    basicSettings.ownerWhatsapp !== null
  ) {
    throw new Error('Basic must drop owner WhatsApp and stay on Google Review')
  }
  if ((await resolveRedirect(publicId)).kind !== 'google' || await getPublicFeedbackCard(publicId)) {
    throw new Error('Basic must skip the rating page')
  }
  for (let rating = 1; rating <= 5; rating++) {
    if ((await resolveFeedbackDestination({ publicId, rating })).kind !== 'google') {
      throw new Error('Basic must send every rating to Google')
    }
  }
  await expectReject(
    () => submitAnonymousFeedback({
      publicId,
      rating: 1,
      message: 'Stale anonymous form after switching to Basic',
      submissionId: crypto.randomUUID(),
    }),
    'Anonymous submission after switching to Basic',
  )
  for (const defaults of DEFAULT_SERVICE_PACKAGES) {
    await updateServicePackage(defaults)
  }
  const restored = await getServicePackages()
  for (const defaults of DEFAULT_SERVICE_PACKAGES) {
    const row = restored.find((item) => item.serviceTier === defaults.serviceTier)
    if (
      !row ||
      row.name !== defaults.name ||
      row.interceptMaxRating !== defaults.interceptMaxRating
    ) {
      throw new Error('Package defaults must be restored after configuration tests')
    }
  }
  console.log('configurable packages passed')
}

async function checkHolderAccounts() {
  const batch = await generateStockBatch({ count: 3, label: 'QA-HOLDER' })
  const cardA = batch.units[0]
  const cardB = batch.units[1]
  const cardC = batch.units[2]
  if (!cardA || !cardB || !cardC) throw new Error('Expected holder test cards')

  const holder = await createHolder({
    email: `holder-b-${cardA.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    name: 'Holder B',
    pin: '2580',
  })
  if (
    holder.notify.email.status !== 'SKIPPED' ||
    holder.notify.whatsapp.status !== 'SKIPPED'
  ) {
    throw new Error('PIN notify must follow mail/WhatsApp settings, not a side channel')
  }
  const other = await createHolder({
    email: `holder-c-${cardB.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    pin: '2581',
  })
  await assignUnitToHolder({ ownerId: holder.id, publicId: cardA.publicId })
  await assignUnitToHolder({ ownerId: holder.id, publicId: cardB.publicId })

  await db
    .update(units)
    .set({ ownerWhatsapp: '6281234567890' })
    .where(eq(units.publicId, cardA.publicId))
  const publicAssignedCard = await getActivationCardForViewer(cardA.publicId, null)
  if (
    !publicAssignedCard?.hasOwner ||
    publicAssignedCard.isHolder ||
    publicAssignedCard.ownerWhatsapp !== null ||
    'ownerId' in publicAssignedCard
  ) {
    throw new Error('Public activation metadata must hide holder identity and WhatsApp')
  }
  const holderAssignedCard = await getActivationCardForViewer(cardA.publicId, {
    ownerId: holder.id,
    role: 'USER',
  })
  if (holderAssignedCard?.ownerWhatsapp !== '6281234567890') {
    throw new Error('The holder may still see their own activation settings')
  }

  const mine = await getHolder(holder.id)
  if (!mine || mine.cards.length !== 2) {
    throw new Error('Holder dashboard must list assigned cards only')
  }

  await verifyActivationAccess({
    publicId: cardA.publicId,
    sessionOwnerId: holder.id,
  })
  await expectReject(
    () =>
      verifyActivationAccess({
        publicId: cardA.publicId,
        sessionOwnerId: other.id,
      }),
    'Another holder skipping PIN',
  )
  await expectReject(
    () =>
      activateUnit({
        publicId: cardC.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        sessionOwnerId: other.id,
        sessionRole: 'USER',
      }),
    'Logged-in user activating an unassigned card without PIN',
  )
  await expectReject(
    () =>
      activateUnit({
        publicId: cardC.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2468',
      }),
    'Unassigned card with unknown PIN',
  )
  await verifyActivationAccess({
    publicId: cardA.publicId,
    sessionRole: 'ADMIN',
  })
  await verifyActivationAccess({
    publicId: cardC.publicId,
    sessionRole: 'ADMIN',
  })

  const lockoutBatch = await generateStockBatch({ count: 1, label: 'QA-PIN-LOCKOUT' })
  const lockoutCard = lockoutBatch.units[0]
  if (!lockoutCard) throw new Error('Expected PIN lockout test card')
  await assignUnitToHolder({ ownerId: holder.id, publicId: lockoutCard.publicId })
  for (let attempt = 0; attempt < 5; attempt++) {
    await expectReject(
      () =>
        verifyActivationAccess({
          publicId: lockoutCard.publicId,
          pin: '2581',
          clientKey: 'attacker-client',
        }),
      `PIN lockout wrong attempt ${attempt + 1}`,
    )
  }
  await expectReject(
    () =>
      verifyActivationAccess({
        publicId: lockoutCard.publicId,
        pin: '2580',
        clientKey: 'attacker-client',
      }),
    'Correct PIN after the same client is locked out',
  )
  await verifyActivationAccess({
    publicId: lockoutCard.publicId,
    pin: '2580',
    clientKey: 'holder-client',
  })
  await activateUnit({
    publicId: lockoutCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    sessionOwnerId: holder.id,
  })

  const claimBatch = await generateStockBatch({ count: 3, label: 'QA-CLAIM' })
  const claimCard = claimBatch.units[0]
  const adminFreeCard = claimBatch.units[1]
  const adminAssignedCard = claimBatch.units[2]
  if (!claimCard || !adminFreeCard || !adminAssignedCard) {
    throw new Error('Expected unassigned claim cards')
  }
  const claimer = await createHolder({
    email: `claimer-${claimCard.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    name: 'Claimer',
    pin: '1357',
  })
  await activateUnit({
    publicId: claimCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    pin: '1357',
  })
  const claimed = await getActivationCard(claimCard.publicId)
  if (claimed?.status !== 'ACTIVE' || claimed.ownerId !== claimer.id) {
    throw new Error('Unassigned card + holder PIN must claim that holder')
  }
  await activateUnit({
    publicId: adminFreeCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    sessionRole: 'ADMIN',
  })
  const adminFree = await getActivationCard(adminFreeCard.publicId)
  if (adminFree?.status !== 'ACTIVE' || adminFree.ownerId !== null) {
    throw new Error('Admin must activate unassigned cards without PIN or owner')
  }
  await assignUnitToHolder({
    ownerId: holder.id,
    publicId: adminAssignedCard.publicId,
  })
  await activateUnit({
    publicId: adminAssignedCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    sessionRole: 'ADMIN',
  })
  const adminAssigned = await getActivationCard(adminAssignedCard.publicId)
  if (adminAssigned?.status !== 'ACTIVE' || adminAssigned.ownerId !== holder.id) {
    throw new Error('Admin activating an assigned card must keep the holder')
  }

  await activateUnit({
    publicId: cardA.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    sessionOwnerId: holder.id,
  })
  const activated = await getActivationCard(cardA.publicId)
  if (activated?.status !== 'ACTIVE' || activated.ownerId !== holder.id) {
    throw new Error('Dashboard activation must keep the holder on the card')
  }
  if ((await resolveRedirect(cardA.publicId)).kind !== 'google') {
    throw new Error('Guests must still open Google Review after activation')
  }
  const activatedPlace = await getPlaceDetails('ChIJN1t_tDeuEmsRUsoyG83frY4')
  const activatedDetail = await getUnitDetail(activated.id)
  if (
    activatedDetail?.outlet?.baselineRating !== activatedPlace.rating ||
    activatedDetail.outlet.baselineUserRatingCount !==
      activatedPlace.userRatingCount
  ) {
    throw new Error(
      'Activation must store Google rating and review count from before the card is filled',
    )
  }
  const ownerTap = await resolveRedirect(cardA.publicId, holder.id)
  if (ownerTap.kind !== 'manage' || ownerTap.unitId !== activated.id) {
    throw new Error('Holder tapping their own card must open the dashboard, not Google')
  }
  const rebound = await rebindUnitOutlet({
    unitId: activated.id,
    placeId: 'DEV_dG9rby1iYXJ1',
    actorOwnerId: holder.id,
  })
  if (rebound.outlet.placeId !== 'DEV_dG9rby1iYXJ1') {
    throw new Error('Holder must be able to move a card to the correct shop')
  }
  const reboundDetail = await getUnitDetail(activated.id)
  if (
    reboundDetail?.outlet?.googlePlaceId !== 'DEV_dG9rby1iYXJ1' ||
    reboundDetail.outlet.baselineRating == null
  ) {
    throw new Error('Rebind must capture baseline rating for the new shop')
  }
  const firstShopAgain = await db.query.outlets.findFirst({
    where: eq(outlets.googlePlaceId, 'ChIJN1t_tDeuEmsRUsoyG83frY4'),
  })
  if (
    firstShopAgain?.baselineRating !== activatedPlace.rating ||
    firstShopAgain.baselineUserRatingCount !== activatedPlace.userRatingCount
  ) {
    throw new Error('Rebind must keep the original shop baseline snapshot')
  }

  const prospectPlace = 'DEV_dG9rby1wcm9zcGVr'
  const savedProspect = await saveProspect({
    placeId: prospectPlace,
    partnerRef: 'andi',
    notes: 'Kafe seberang kampus',
  })
  if (
    !savedProspect.created ||
    savedProspect.prospect.rating == null ||
    savedProspect.prospect.userRatingCount == null ||
    savedProspect.prospect.partnerRef !== 'andi'
  ) {
    throw new Error('Saving a prospect must store Google name, rating, and review count')
  }
  const savedAgain = await saveProspect({ placeId: prospectPlace })
  if (
    savedAgain.created ||
    savedAgain.prospect.rating !== savedProspect.prospect.rating ||
    savedAgain.prospect.userRatingCount !== savedProspect.prospect.userRatingCount
  ) {
    throw new Error('Re-saving a prospect must keep the first rating snapshot')
  }
  const prospectBatch = await generateStockBatch({ count: 1, label: 'QA-PROSPECT' })
  const prospectCard = prospectBatch.units[0]
  if (!prospectCard) throw new Error('Expected prospect card')
  await activateUnit({
    publicId: prospectCard.publicId,
    placeId: prospectPlace,
    sessionRole: 'ADMIN',
  })
  const listedProspects = await listProspects({ partner: 'andi' })
  const won = listedProspects.prospects.find(
    (row) => row.googlePlaceId === savedProspect.prospect.googlePlaceId,
  )
  if (
    !won ||
    won.status !== 'CONTACTED' ||
    won.unitId == null ||
    won.installKind !== 'TRIAL' ||
    won.installState !== 'trial'
  ) {
    throw new Error('Activating a card for a saved shop must start a 7-day trial')
  }
  const prospectCardDetail = await getUnitDetail(
    (await getActivationCard(prospectCard.publicId))!.id,
  )
  if (
    prospectCardDetail?.outlet?.baselineRating !== savedProspect.prospect.rating ||
    prospectCardDetail.outlet.baselineUserRatingCount !==
      savedProspect.prospect.userRatingCount
  ) {
    throw new Error('Won prospect must keep the pre-card Google rating snapshot')
  }
  const occupiedBatch = await generateStockBatch({ count: 1, label: 'QA-OCCUPIED' })
  const occupiedCard = occupiedBatch.units[0]
  if (!occupiedCard) throw new Error('Expected occupancy card')
  await expectReject(
    () =>
      attachPlaceToCard({
        sessionRole: 'ADMIN',
        place: {
          placeId: prospectPlace,
          name: savedProspect.prospect.name,
          address: savedProspect.prospect.formattedAddress,
          description: savedProspect.prospect.name,
          rating: savedProspect.prospect.rating,
          userRatingCount: savedProspect.prospect.userRatingCount,
          googleMapsUri: savedProspect.prospect.googleMapsUri,
          primaryType: savedProspect.prospect.primaryType,
        },
        publicId: occupiedCard.publicId,
      }),
    'Second trial on an already-active shop',
  )
  await expectReject(
    () =>
      rebindUnitOutlet({
        unitId: activated.id,
        placeId: 'DEV_dG9rby1sYWlu',
        actorOwnerId: other.id,
      }),
    'Another holder moving the shop',
  )

  const rotated = await resetHolderPin(holder.id)
  await expectReject(
    () =>
      activateUnit({
        publicId: cardB.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2580',
      }),
    'Old PIN after rotation',
  )
  await activateUnit({
    publicId: cardB.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    pin: rotated.pin,
  })

  await assignUnitToHolder({ ownerId: other.id, publicId: cardC.publicId })
  await setHolderStatus(other.id, 'DISABLED')
  await expectReject(
    () =>
      activateUnit({
        publicId: cardC.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2581',
      }),
    'Disabled holder',
  )

  await db
    .insert(whatsappGatewayState)
    .values({
      id: 'primary',
      status: 'OFFLINE',
      lastHeartbeatAt: new Date(Date.now() - 120_000),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappGatewayState.id,
      set: {
        status: 'OFFLINE',
        lastHeartbeatAt: new Date(Date.now() - 120_000),
        updatedAt: new Date(),
      },
    })
  if (await isWhatsappGatewayOpen()) {
    throw new Error('Stale gateway must hide WhatsApp login')
  }
  await expectReject(
    () => requestLoginOtp('081298765432'),
    'OTP while WhatsApp is down',
  )
  await expectReject(
    () => testWhatsapp('081298765432'),
    'WhatsApp test while gateway is down',
  )

  const waNumber = `0812${cardA.publicId.replace(/[^0-9]/g, '').padEnd(8, '8').slice(0, 8)}`
  const waHolder = await createHolder({
    name: 'WA Holder',
    whatsapp: waNumber,
    pin: '2580',
  })
  if (!waHolder.whatsapp) throw new Error('Holder WhatsApp must be stored')
  await db
    .insert(whatsappGatewayState)
    .values({
      id: 'primary',
      status: 'OPEN',
      workerId: 'smoke-otp',
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappGatewayState.id,
      set: {
        status: 'OPEN',
        workerId: 'smoke-otp',
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      },
    })
  await db
    .update(whatsappOutbox)
    .set({ status: 'FAILED', updatedAt: new Date() })
    .where(
      or(
        eq(whatsappOutbox.status, 'QUEUED'),
        eq(whatsappOutbox.status, 'PROCESSING'),
      ),
    )
  const requested = await requestLoginOtp(waNumber)
  if (!requested.ok) throw new Error('OTP request must succeed when gateway is open')
  const queued = await pollWhatsappGateway({
    workerId: 'smoke-otp',
    connected: true,
  })
  const code = queued.job?.message.match(/\b(\d{6})\b/)?.[1]
  const expectedWa = waHolder.whatsapp
  if (!queued.job || queued.job.to !== expectedWa || !code) {
    throw new Error('Open gateway must send the login code to the holder WhatsApp')
  }
  const waLogs = await listOutboundLogs({ channel: 'whatsapp', pageSize: 50 })
  if (
    !waLogs.items.some(
      (item) => item.kind === 'OTP' && item.to === expectedWa && item.preview.includes('••••••'),
    )
  ) {
    throw new Error('WhatsApp OTP must appear in outbound logs without exposing the code')
  }
  const waTest = await testWhatsapp(waNumber)
  if (waTest.to !== expectedWa) {
    throw new Error('WhatsApp test must queue to the normalized holder number')
  }
  const waTestLogs = await listOutboundLogs({ channel: 'whatsapp', pageSize: 50 })
  if (!waTestLogs.items.some((item) => item.id === waTest.id && item.kind === 'TEST')) {
    throw new Error('WhatsApp test send must appear in outbound logs')
  }
  const session = await verifyLoginOtp(waNumber, code)
  if (session.role !== 'USER' || session.ownerId !== waHolder.id) {
    throw new Error('Valid WhatsApp OTP must sign the holder in')
  }
  await expectReject(
    () => verifyLoginOtp(waNumber, code),
    'Reusing a spent OTP',
  )
  const waPin = await resetHolderPin(waHolder.id)
  if (
    waPin.notify.whatsapp.status !== 'QUEUED' ||
    waPin.notify.email.status !== 'SKIPPED'
  ) {
    throw new Error('PIN reset must use the open WhatsApp gateway and skip placeholder email')
  }
  const waPinLogs = await listOutboundLogs({ channel: 'whatsapp', pageSize: 50 })
  const pinNotice = waPinLogs.items.find(
    (item) => item.kind === 'NOTICE' && item.to === expectedWa,
  )
  if (!pinNotice || pinNotice.preview.includes(waPin.pin)) {
    throw new Error('WhatsApp PIN notice must appear in outbound logs without the PIN')
  }

  if (await isSmtpReady()) {
    throw new Error('SMTP must stay off until admin enables it')
  }
  await expectReject(
    () => requestEmailLoginOtp(holder.email),
    'Email OTP while mail is off',
  )
  const smtp = await saveSmtpSettings({
    provider: 'smtp',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: 'noreply@example.com',
    password: 'smtp-pass-123',
    fromName: 'Ternak Review',
    fromEmail: 'noreply@example.com',
    enabled: false,
  })
  if (
    smtp.provider !== 'smtp' ||
    !smtp.hasPassword ||
    smtp.host !== 'smtp.example.com' ||
    smtp.enabled
  ) {
    throw new Error('SMTP settings must persist without exposing the password')
  }
  const kept = await saveSmtpSettings({
    provider: 'smtp',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: 'noreply@example.com',
    fromEmail: 'noreply@example.com',
    enabled: true,
  })
  if (!kept.enabled || !(await isSmtpReady()) || kept.hasPassword !== true) {
    throw new Error('Saving SMTP without a new password must keep the stored secret')
  }
  await saveSmtpSettings({
    provider: 'smtp',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    fromEmail: 'noreply@example.com',
    enabled: false,
  })
  await expectReject(
    () =>
      saveSmtpSettings({
        provider: 'resend',
        host: '',
        port: 465,
        secure: true,
        fromEmail: 'noreply@example.com',
        enabled: true,
      }),
    'Switching to Resend without an API key',
  )
  const resend = await saveSmtpSettings({
    provider: 'resend',
    host: '',
    port: 465,
    secure: true,
    password: 're_test_key_not_for_send',
    fromName: 'Ternak Review',
    fromEmail: 'noreply@example.com',
    enabled: true,
  })
  if (
    resend.provider !== 'resend' ||
    resend.host !== 'smtp.resend.com' ||
    !resend.hasPassword ||
    !resend.sendSupported ||
    !(await isSmtpReady())
  ) {
    throw new Error('Resend API key must enable email without an SMTP socket')
  }
  await expectReject(
    () =>
      sendAppEmail({
        to: 'log-probe@example.com',
        subject: 'Smoke log',
        text: 'probe 482193 should redact',
        kind: 'TEST',
      }),
    'Fake Resend key must fail the probe send',
  )
  const emailLogs = await listOutboundLogs({ channel: 'email', pageSize: 20 })
  const probe = emailLogs.items.find((item) => item.to === 'log-probe@example.com')
  if (!probe || probe.status !== 'FAILED' || probe.preview.includes('482193')) {
    throw new Error('Failed email send must appear in outbound logs with redacted secrets')
  }
  const unknownMail = await requestEmailLoginOtp('nobody-otp@example.com')
  if (!unknownMail.ok) {
    throw new Error('Unknown email OTP must stay generic')
  }
  const staff = await createHolder({
    email: 'staff-otp@example.com',
    password: 'staff-otp-pass',
    pin: '4826',
    role: 'ADMIN',
  })
  const staffMail = await requestEmailLoginOtp(staff.email)
  if (!staffMail.ok) {
    throw new Error('Staff email OTP must stay generic')
  }
  await expectReject(
    () => requestEmailLoginOtp(holder.email),
    'Fake Resend key must fail holder OTP send',
  )
  const otpLogs = await listOutboundLogs({ channel: 'email', pageSize: 20 })
  const otpFail = otpLogs.items.find(
    (item) => item.kind === 'OTP' && item.to === holder.email,
  )
  if (!otpFail || otpFail.status !== 'FAILED') {
    throw new Error('Email OTP must send through the configured Resend/SMTP path')
  }
  if (otpFail.preview.match(/\b\d{6}\b/)) {
    throw new Error('Email OTP logs must redact the code')
  }
  if (
    otpLogs.items.some(
      (item) => item.kind === 'OTP' && item.to === 'nobody-otp@example.com',
    )
  ) {
    throw new Error('Unknown email must not enqueue an OTP message')
  }
  if (
    otpLogs.items.some((item) => item.kind === 'OTP' && item.to === staff.email)
  ) {
    throw new Error('Email OTP must never go to staff accounts; they sign in with a password')
  }
  const pinMail = await resetHolderPin(holder.id)
  if (pinMail.notify.email.status !== 'FAILED') {
    throw new Error('PIN email must go through the configured Resend/SMTP path')
  }
  const pinMailLogs = await listOutboundLogs({ channel: 'email', pageSize: 20 })
  const pinMailItem = pinMailLogs.items.find(
    (item) => item.kind === 'NOTICE' && item.to === holder.email,
  )
  if (!pinMailItem || pinMailItem.preview.includes(pinMail.pin)) {
    throw new Error('PIN email must appear in outbound logs without the PIN')
  }
  await saveSmtpSettings({
    provider: 'resend',
    host: '',
    port: 465,
    secure: true,
    fromEmail: 'noreply@example.com',
    enabled: false,
  })
  console.log('holder accounts passed')
}

async function checkBusinessQa() {
  await setSmokeGateway('OFFLINE')
  await saveSmtpSettings({
    provider: 'resend',
    host: '',
    port: 465,
    secure: true,
    fromEmail: 'noreply@example.com',
    enabled: false,
  })

  const batch = await generateStockBatch({ count: 3, label: 'QA-BIZ' })
  const plusCard = batch.units[0]
  const proCard = batch.units[1]
  const basicCard = batch.units[2]
  if (!plusCard || !proCard || !basicCard) throw new Error('Expected business QA cards')

  const holder = await createHolder({
    email: `biz-${plusCard.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    whatsapp: '081298711111',
    name: 'Biz Holder',
    pin: '8642',
  })
  if (
    holder.notify.email.status !== 'SKIPPED' ||
    holder.notify.whatsapp.status !== 'SKIPPED'
  ) {
    throw new Error('QA: PIN notify must skip when email and WhatsApp settings are off')
  }

  await expectReject(
    () =>
      activateUnit({
        publicId: plusCard.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '8642',
        serviceTier: 'PLUS',
      }),
    'QA Plus without owner number',
  )
  await activateUnit({
    publicId: proCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    pin: '8642',
    serviceTier: 'PRO',
    ownerWhatsapp: '081234567890',
  })
  if ((await resolveRedirect(proCard.publicId)).kind !== 'feedback') {
    throw new Error('QA Pro must keep the feedback page while WhatsApp is down')
  }
  if (!(await getPublicFeedbackCard(proCard.publicId))) {
    throw new Error('QA Pro feedback form must remain visible while WhatsApp is down')
  }
  const proOfflineDestination = await resolveFeedbackDestination({
    publicId: proCard.publicId,
    rating: 3,
  })
  if (proOfflineDestination.kind !== 'anonymous') {
    throw new Error('QA Pro low ratings must stay on the private form while offline')
  }
  const proOfflineSubmissionId = crypto.randomUUID()
  const proOfflineSubmission = await submitAnonymousFeedback({
    publicId: proCard.publicId,
    rating: 3,
    message: 'offline Pro feedback',
    submissionId: proOfflineSubmissionId,
  })
  if (proOfflineSubmission.status !== 'QUEUED') {
    throw new Error('QA Pro feedback must queue while WhatsApp is down')
  }
  const proOfflineLogs = await listOutboundLogs({ channel: 'whatsapp', pageSize: 100 })
  const proOfflineLog = proOfflineLogs.items.find(
    (item) => item.kind === 'FEEDBACK' && item.id === proOfflineSubmissionId,
  )
  if (!proOfflineLog || proOfflineLog.status !== 'QUEUED') {
    throw new Error('QA queued Pro feedback must appear in outbound logs')
  }

  await activateUnit({
    publicId: plusCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    pin: '8642',
    serviceTier: 'PLUS',
    ownerWhatsapp: '081234567890',
  })
  const plusState = await getActivationCard(plusCard.publicId)
  if (plusState?.serviceTier !== 'PLUS') {
    throw new Error('QA Plus activation must store the package')
  }
  if ((await resolveRedirect(plusCard.publicId)).kind !== 'feedback') {
    throw new Error('QA Plus guest must open the rating page, not jump to Google')
  }
  const plusLow = await resolveFeedbackDestination({
    publicId: plusCard.publicId,
    rating: 3,
  })
  if (plusLow.kind !== 'owner_whatsapp') {
    throw new Error('QA Plus rating 3 must open owner WhatsApp')
  }
  const plusHigh = await resolveFeedbackDestination({
    publicId: plusCard.publicId,
    rating: 5,
  })
  if (plusHigh.kind !== 'google') {
    throw new Error('QA Plus rating 5 must go to Google Review')
  }

  await activateUnit({
    publicId: basicCard.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    pin: '8642',
    serviceTier: 'BASIC',
    ownerWhatsapp: '081234567890',
  })
  const basicState = await getActivationCard(basicCard.publicId)
  if (!basicState) throw new Error('Expected basic card')
  const basicSaved = await updateUnitReviewSettings({
    unitId: basicState.id,
    serviceTier: 'BASIC',
    ownerWhatsapp: '081298700000',
  })
  if (
    !basicSaved.ok ||
    basicSaved.ownerWhatsapp !== null ||
    (await resolveRedirect(basicCard.publicId)).kind !== 'google'
  ) {
    throw new Error('QA Basic must ignore owner number and stay on Google Review')
  }

  await setSmokeGateway('OPEN')
  const proLow = await resolveFeedbackDestination({
    publicId: proCard.publicId,
    rating: 3,
  })
  if (proLow.kind !== 'anonymous') {
    throw new Error('QA Pro rating 3 must open the private form')
  }
  const proHigh = await resolveFeedbackDestination({
    publicId: proCard.publicId,
    rating: 5,
  })
  if (proHigh.kind !== 'google') {
    throw new Error('QA Pro rating 5 must go to Google Review')
  }

  await setSmokeGateway('OFFLINE')
  if ((await resolveRedirect(proCard.publicId)).kind !== 'feedback') {
    throw new Error('QA Pro guests must keep the feedback page when WhatsApp is down')
  }
  if (!(await getPublicFeedbackCard(proCard.publicId))) {
    throw new Error('QA Pro form must stay visible when WhatsApp is down')
  }
  const proState = await getActivationCard(proCard.publicId)
  if (!proState) throw new Error('Expected pro card')
  const proUpdated = await updateUnitReviewSettings({
    unitId: proState.id,
    serviceTier: 'PRO',
    ownerWhatsapp: '081298722222',
  })
  if (!proUpdated.ok || proUpdated.ownerWhatsapp !== '6281298722222') {
    throw new Error('QA must still save Pro owner number while WhatsApp is down')
  }
  await db
    .update(reviewFeedbacks)
    .set({ status: 'FAILED', deliveryError: 'smoke-retry', updatedAt: new Date() })
    .where(eq(reviewFeedbacks.id, proOfflineSubmissionId))
  if (!(await retryFeedback(proOfflineSubmissionId))) {
    throw new Error('QA failed Pro feedback must be resendable')
  }
  const proRetried = (await listUnitFeedback(proState.id)).find(
    (item) => item.id === proOfflineSubmissionId,
  )
  if (proRetried?.status !== 'QUEUED') {
    throw new Error('QA resending Pro feedback must put it back in the queue')
  }

  await setSmokeGateway('OPEN')
  await saveSmtpSettings({
    provider: 'resend',
    host: '',
    port: 465,
    secure: true,
    password: 're_test_key_not_for_send',
    fromName: 'Ternak Review',
    fromEmail: 'noreply@example.com',
    enabled: true,
  })
  const both = await createHolder({
    email: `both-${plusCard.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    whatsapp: '081298733333',
    pin: '1357',
  })
  if (both.notify.email.status !== 'FAILED' || both.notify.whatsapp.status !== 'QUEUED') {
    throw new Error('QA: PIN notify must use both configured email and WhatsApp paths')
  }
  const bothLogs = await listOutboundLogs({ pageSize: 50 })
  const emailNotice = bothLogs.items.find(
    (item) => item.channel === 'email' && item.kind === 'WELCOME' && item.to === both.email,
  )
  const waNotice = bothLogs.items.find(
    (item) => item.channel === 'whatsapp' && item.kind === 'NOTICE' && item.to === both.whatsapp,
  )
  if (!emailNotice || emailNotice.preview.includes('1357')) {
    throw new Error('QA email PIN notice must use Resend/SMTP outbox without exposing PIN')
  }
  if (!waNotice || waNotice.preview.includes('1357')) {
    throw new Error('QA WhatsApp PIN notice must use gateway outbox without exposing PIN')
  }

  await saveSmtpSettings({
    provider: 'resend',
    host: '',
    port: 465,
    secure: true,
    fromEmail: 'noreply@example.com',
    enabled: false,
  })
  await setSmokeGateway('OFFLINE')
  console.log('business QA passed')
}

async function checkStockOwnership() {
  const before = await getAdminDashboardSummary()
  const batch = await generateStockBatch({ count: 5, label: 'QA-ALLOCATION' })
  const [available, assigned, active, inactive] = batch.units
  const holder = await createHolder({
    email: `allocation-${available.publicId.toLowerCase()}@smoke.test`,
    password: 'allocation-qa-12',
    name: 'Allocation QA',
    pin: '9742',
  })
  for (const card of [available, assigned, active, inactive]) {
    await markNfcEncoded(card.publicId)
  }
  await assignUnitToHolder({ ownerId: holder.id, publicId: assigned.publicId })
  for (const card of [active, inactive]) {
    await activateUnit({
      publicId: card.publicId,
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      sessionRole: 'ADMIN',
    })
  }
  const inactiveCard = await getActivationCard(inactive.publicId)
  if (!inactiveCard) throw new Error('Expected inactive allocation fixture')
  await setUnitActiveState(inactiveCard.id, false)
  const summary = await getAdminDashboardSummary()
  if (
    summary.stockCount !== before.stockCount + 3 ||
    summary.availableStockCount !== before.availableStockCount + 2 ||
    summary.assignedStockCount !== before.assignedStockCount + 1 ||
    summary.readyStockCount !== before.readyStockCount + 1
  ) {
    throw new Error('Stock must separate available, assigned, activated and unencoded cards')
  }
  const row = (await listStockBatches()).find((item) => item.id === batch.batchId)
  if (!row || row.remaining !== 5 || row.available !== 2 || row.assigned !== 1 || row.readyStock !== 1 || row.active !== 1 || row.inactive !== 1) {
    throw new Error('Batch operational counts must match card ownership and activation')
  }
  const pending = await listUnits({ batchId: batch.batchId, status: 'IN_STOCK', ownership: 'assigned' })
  if (pending.total !== 1 || pending.units[0]?.holderId !== holder.id || pending.units[0]?.publicId !== assigned.publicId || !pending.units[0]?.nfcEncodedAt) {
    throw new Error('Pending activation filter must return the assigned card with holder and NFC data')
  }
  const rejectedUnitDelete = await deleteUnit(pending.units[0]!.id)
  if (rejectedUnitDelete.ok || !rejectedUnitDelete.error.includes('pemegang')) {
    throw new Error('An assigned warehouse card must not be deleted')
  }
  const rejectedBatchDelete = await deleteStockBatch(batch.batchId)
  if (rejectedBatchDelete.ok || !rejectedBatchDelete.error.includes('dipakai toko')) {
    throw new Error('A batch with installed cards must not be deleted')
  }
  const assignedBatch = await generateStockBatch({ count: 1, label: 'QA-ASSIGNED-ONLY' })
  const assignedOnly = assignedBatch.units[0]
  if (!assignedOnly) throw new Error('Expected assigned-only batch card')
  await assignUnitToHolder({ ownerId: holder.id, publicId: assignedOnly.publicId })
  const rejectedAssignedBatchDelete = await deleteStockBatch(assignedBatch.batchId)
  if (rejectedAssignedBatchDelete.ok || !rejectedAssignedBatchDelete.error.includes('dialokasikan')) {
    throw new Error('A batch with assigned cards must not be deleted')
  }
  const stock = await listUnits({ batchId: batch.batchId, status: 'IN_STOCK', ownership: 'unassigned' })
  if (stock.total !== 2 || stock.units.some((card) => card.holderId !== null)) {
    throw new Error('Available stock filter must exclude assigned and installed cards')
  }
  const holderSearch = await listUnits({ batchId: batch.batchId, q: 'Allocation QA' })
  if (holderSearch.total !== 1 || holderSearch.units[0]?.publicId !== assigned.publicId) {
    throw new Error('Admin must be able to find allocated cards by holder name')
  }

  const installed = await listUnits({ batchId: batch.batchId, status: 'ACTIVE' })
  const toReset = installed.units[0]
  if (!toReset?.canReset) {
    throw new Error('An installed card must be resettable to warehouse stock')
  }
  const reset = await resetUnitToStock(toReset.id)
  if (!reset.ok) throw new Error(reset.error)
  const afterReset = await getUnitDetail(toReset.id)
  if (
    !afterReset ||
    afterReset.status !== 'IN_STOCK' ||
    afterReset.outlet ||
    afterReset.holder ||
    afterReset.activatedAt
  ) {
    throw new Error('Reset must return the card to unused warehouse stock')
  }
  await activateUnit({
    publicId: toReset.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    sessionRole: 'ADMIN',
  })
  const reactivated = await getActivationCard(toReset.publicId)
  if (reactivated?.status !== 'ACTIVE') {
    throw new Error('A reset card must be activatable again')
  }

  const large = await generateStockBatch({ count: 500, label: 'QA-PRINT-500' })
  if (large.units.length !== 500) {
    throw new Error('Must generate 500 unique cards for print')
  }
  const printPack = await getBatchPrintData({ batchId: large.batchId })
  if (printPack.units.length !== 500) {
    throw new Error('Print data must include all 500 cards')
  }
  const samplePdf = await buildPrintPdf({
    cards: printPack.units.slice(0, 3).map((unit) => ({
      publicId: unit.publicId,
      redirectUrl: unit.redirectUrl,
    })),
    layout: 'sheet',
  })
  const pdfHead = Buffer.from(samplePdf.subarray(0, 5)).toString('latin1')
  if (pdfHead !== '%PDF-') {
    throw new Error('Percetakan file must be a PDF CorelDRAW can open')
  }
  const pdfText = Buffer.from(samplePdf).toString('latin1')
  if ((pdfText.match(/\/Type\s*\/Page(?!s)/g) ?? []).length < 3) {
    throw new Error('One print file must contain many card pages')
  }
  const removedLarge = await deleteStockBatch(large.batchId)
  if (!removedLarge.ok) {
    throw new Error('An unused 500-card batch must be removable')
  }

  console.log('stock ownership flow passed')
}

async function checkTrialOwnership() {
  await setSmokeGateway('OFFLINE')
  const giver = await createHolder({
    email: 'trial-giver@example.com',
    password: 'trial-giver-1',
    pin: '7391',
  })
  const taker = await createHolder({
    email: 'trial-taker@example.com',
    password: 'trial-taker-1',
    pin: '5194',
  })
  const batch = await generateStockBatch({ count: 2, label: 'QA-TRIAL-OWNER' })
  const [trialCard, takerCard] = batch.units
  if (!trialCard || !takerCard) throw new Error('Expected trial ownership cards')
  await assignUnitToHolder({ ownerId: giver.id, publicId: trialCard.publicId })
  await assignUnitToHolder({ ownerId: taker.id, publicId: takerCard.publicId })

  await expectReject(
    () =>
      attachPlaceToCard({
        place: {
          placeId: 'DEV_dG9rby1vd25lcg',
          name: 'toko-owner',
          address: null,
          description: 'toko-owner',
          rating: 4.1,
          userRatingCount: 12,
          googleMapsUri: null,
          primaryType: null,
        },
        publicId: takerCard.publicId,
        sessionOwnerId: giver.id,
        sessionRole: 'USER',
      }),
    "Holder installing another holder's card without their PIN",
  )
  const untouched = await db.query.units.findFirst({
    where: eq(units.publicId, takerCard.publicId),
  })
  if (untouched?.status !== 'IN_STOCK' || untouched.ownerId !== taker.id) {
    throw new Error("A rejected install must leave the other holder's card untouched")
  }

  const trialPlace = 'DEV_dG9rby10cmlhbA'
  const installed = await activateUnit({
    publicId: trialCard.publicId,
    placeId: trialPlace,
    serviceTier: 'PRO',
    ownerWhatsapp: '081234567890',
    installKind: 'TRIAL',
    sessionOwnerId: giver.id,
    sessionRole: 'USER',
  })
  if (installed.prospect?.installState !== 'trial') {
    throw new Error('A holder installing their own card must start a trial')
  }
  await rebindUnitOutlet({
    unitId: installed.unitId,
    placeId: trialPlace,
    actorOwnerId: giver.id,
  })
  const sameShop = (await listProspects({ ownerId: giver.id })).prospects.find(
    (row) => row.unitId === installed.unitId,
  )
  if (sameShop?.installState !== 'trial') {
    throw new Error('Picking the same shop again must not turn a trial into a sale')
  }

  await assignUnitToHolder({ ownerId: taker.id, unitId: installed.unitId })
  const takerTrial = (await listProspects({ ownerId: taker.id })).prospects.find(
    (row) => row.unitId === installed.unitId,
  )
  if (!takerTrial || takerTrial.installState !== 'trial') {
    throw new Error('Handing a card over must move its trial to the new holder')
  }
  const giverLeft = await listProspects({ ownerId: giver.id })
  if (giverLeft.prospects.some((row) => row.unitId === installed.unitId)) {
    throw new Error('The previous holder must no longer track a handed-over card')
  }

  // Cards moved before handovers carried the trial: the holder of the
  // prospect must not collect a card another account now holds.
  await db.update(units).set({ ownerId: giver.id }).where(eq(units.id, installed.unitId))
  await expectReject(
    () => collectProspectTrial(takerTrial.id, taker.id),
    'Collecting a trial card another holder now holds',
  )
  await expectReject(
    () => convertProspectToSold(takerTrial.id, new Date(), taker.id),
    'Closing a trial card another holder now holds',
  )
  await db.update(units).set({ ownerId: taker.id }).where(eq(units.id, installed.unitId))

  const collected = await collectProspectTrial(takerTrial.id, taker.id)
  if (collected.installState !== 'collected') {
    throw new Error('The new holder must be able to collect the trial card')
  }
  const released = await db.query.units.findFirst({
    where: eq(units.id, installed.unitId),
  })
  if (
    released?.status !== 'IN_STOCK' ||
    released.ownerId !== taker.id ||
    released.ownerWhatsapp !== null
  ) {
    throw new Error(
      'A collected trial card must return to stock without the previous shop owner number',
    )
  }

  // Cards installed before prospects existed have no prospect row. Picking
  // their shop again must still record the install, as it did before.
  const legacyPlace = 'DEV_dG9rby1sYW1h'
  const legacy = await activateUnit({
    publicId: takerCard.publicId,
    placeId: legacyPlace,
    installKind: 'SOLD',
    sessionOwnerId: taker.id,
    sessionRole: 'USER',
  })
  await db.delete(prospects).where(eq(prospects.unitId, legacy.unitId))
  await rebindUnitOutlet({
    unitId: legacy.unitId,
    placeId: legacyPlace,
    actorOwnerId: taker.id,
  })
  const recorded = (await listProspects({ ownerId: taker.id })).prospects.find(
    (row) => row.unitId === legacy.unitId,
  )
  if (recorded?.installState !== 'sold') {
    throw new Error('Re-picking the shop of a card without a prospect must record it as sold')
  }
  console.log('trial ownership passed')
}

async function checkActivationPinSwitch() {
  const place = 'ChIJN1t_tDeuEmsRUsoyG83frY4'
  const batch = await generateStockBatch({ count: 5, label: 'QA-PIN-SWITCH' })
  const [held, free, taken, blocked, later] = batch.units
  if (!held || !free || !taken || !blocked || !later) {
    throw new Error('Expected PIN switch test cards')
  }
  const tag = held.publicId.toLowerCase()
  const holder = await createHolder({
    email: `pin-switch-a-${tag}@smoke.test`,
    password: 'smoke-holder-12',
    pin: '4816',
  })
  const walkIn = await createHolder({
    email: `pin-switch-b-${tag}@smoke.test`,
    password: 'smoke-holder-12',
    pin: '5927',
  })
  const disabled = await createHolder({
    email: `pin-switch-c-${tag}@smoke.test`,
    password: 'smoke-holder-12',
    pin: '6038',
  })
  await assignUnitToHolder({ ownerId: holder.id, publicId: held.publicId })
  await assignUnitToHolder({ ownerId: disabled.id, publicId: blocked.publicId })
  await setHolderStatus(disabled.id, 'DISABLED')

  await saveActivationPinEnabled(false)
  const offView = await getActivationCardForViewer(held.publicId, null)
  if (offView?.pinRequired !== false) {
    throw new Error('With the PIN off, the activation page must not ask for one')
  }
  await verifyActivationAccess({ publicId: held.publicId })
  await activateUnit({ publicId: held.publicId, placeId: place })
  const heldAfter = await getActivationCard(held.publicId)
  if (heldAfter?.status !== 'ACTIVE' || heldAfter.ownerId !== holder.id) {
    throw new Error('With the PIN off, a held card installs and stays with its holder')
  }
  await activateUnit({ publicId: free.publicId, placeId: place })
  const freeAfter = await getActivationCard(free.publicId)
  if (freeAfter?.status !== 'ACTIVE' || freeAfter.ownerId !== null) {
    throw new Error('With the PIN off, a free card installs without a holder')
  }
  await activateUnit({
    publicId: taken.publicId,
    placeId: place,
    sessionOwnerId: walkIn.id,
    sessionRole: 'USER',
  })
  if ((await getActivationCard(taken.publicId))?.ownerId !== walkIn.id) {
    throw new Error('With the PIN off, a signed-in holder takes the free card they install')
  }
  await expectReject(
    () => activateUnit({ publicId: blocked.publicId, placeId: place }),
    'Installing a disabled holder\'s card with the PIN off',
  )

  await saveActivationPinEnabled(true)
  const onView = await getActivationCardForViewer(later.publicId, null)
  if (onView?.pinRequired !== true) {
    throw new Error('With the PIN on, the activation page must ask for it')
  }
  await expectReject(
    () => verifyActivationAccess({ publicId: later.publicId }),
    'Public activation without PIN after the switch is back on',
  )
  await expectReject(
    () => activateUnit({ publicId: later.publicId, placeId: place }),
    'Public activation without PIN after the switch is back on',
  )
  console.log('activation PIN switch passed')
}

async function main() {
  // A new database starts with the activation PIN off. The flows below test
  // the PIN rules, so they run with it on; checkActivationPinSwitch tests off.
  const pinWasEnabled = await isActivationPinEnabled()
  if (process.env.SMOKE_USE_APP_DB !== '1' && pinWasEnabled) {
    throw new Error('Activation PIN must be off until an admin turns it on')
  }
  await saveActivationPinEnabled(true)

  const summaryBeforeBatch = await getAdminDashboardSummary()
  const batch = await generateStockBatch({
    count: 2,
  })
  const tagged = batch.units[0]
  const plain = batch.units[1]
  console.log('generated', tagged.publicId, plain.publicId, batch.batchId)
  if (!batch.csv.includes('qr_url') || !batch.csv.includes('nfc_url')) {
    throw new Error('Card CSV must include qr_url and nfc_url')
  }
  if (!tagged.redirectUrl.includes('/r/')) {
    throw new Error('Card URL must be /r/{id}')
  }
  const urlHits = batch.csv.split(tagged.redirectUrl).length - 1
  if (urlHits < 2) {
    throw new Error('nfc_url must match qr_url')
  }

  const listed = await listStockBatches()
  const created = listed.find((b) => b.id === batch.batchId)
  if (!created || created.count !== 2 || created.remaining !== 2) {
    throw new Error('Expected stock batch in list')
  }
  const summaryAfterBatch = await getAdminDashboardSummary()
  if (summaryAfterBatch.stockCount !== summaryBeforeBatch.stockCount + 2) {
    throw new Error('Generated cards must increase total warehouse stock')
  }
  if (
    summaryAfterBatch.readyStockCount !== summaryBeforeBatch.readyStockCount
  ) {
    throw new Error('Unencoded cards must not increase ready stock')
  }
  if (created.encoded !== 0 || created.next !== 'print') {
    throw new Error('New batch should have no encoded chips')
  }
  const printPack = await getBatchPrintData({
    batchId: batch.batchId,
  })
  if (printPack.units.some((u) => u.redirectUrl !== `/r/${u.publicId}` && !u.redirectUrl.includes(`/r/${u.publicId}`))) {
    throw new Error('Print URL must be the card /r/ link')
  }

  const marked = await markNfcEncoded(tagged.publicId)
  if (marked.nfcUrl !== tagged.redirectUrl || !marked.nfcEncodedAt) {
    throw new Error('Encoding must stamp the card /r/ URL')
  }
  const summaryAfterEncode = await getAdminDashboardSummary()
  if (
    summaryAfterEncode.readyStockCount !==
    summaryBeforeBatch.readyStockCount + 1
  ) {
    throw new Error('Encoded warehouse cards must increase ready stock')
  }
  const listedAfterEncode = await listStockBatches()
  const encodedBatch = listedAfterEncode.find((b) => b.id === batch.batchId)
  if (!encodedBatch || encodedBatch.encoded !== 1 || encodedBatch.next !== 'nfc') {
    throw new Error('Encoded count should increment after NFC write')
  }
  const mobileBatch = serializeMobileBatch(encodedBatch)
  if (
    mobileBatch.id !== encodedBatch.id ||
    mobileBatch.encoded !== 1 ||
    mobileBatch.next !== 'nfc' ||
    typeof mobileBatch.createdAt !== 'string'
  ) {
    throw new Error('Mobile batch payload must serialize NFC progress')
  }
  mobileLoginSchema.parse({ email: 'admin@example.com', password: 'secret1' })
  mobileRefSchema.parse({ ref: tagged.publicId })
  mobileGenerateSchema.parse({ count: 25, label: 'QA' })
  mobileBatchIdSchema.parse({ batchId: batch.batchId })
  await expectReject(
    () => Promise.resolve(mobileLoginSchema.parse({ email: 'bukan-email', password: 'x' })),
    'Mobile login schema',
  )

  const esTehGap = distanceMeters(PHONE_OUTSIDE_CIREBON, CIREBON_CENTER)
  if (esTehGap <= ACTIVATION_SEARCH_BIAS_RADIUS_M) {
    throw new Error(
      'Phone fixture must stay outside the 4km bias around Cirebon',
    )
  }
  const pastedPlaceId = parseGooglePlaceId(
    `https://www.google.com/maps/search/?api=1&query_place_id=${ES_TEH_JOMBLO_KEDUNGJAYA.placeId}`,
  )
  if (pastedPlaceId !== ES_TEH_JOMBLO_KEDUNGJAYA.placeId) {
    throw new Error(
      'Activation must keep the Kedungjaya Place ID when it is pasted from Maps',
    )
  }
  const byPlaceId = activationLookup(
    ES_TEH_JOMBLO_KEDUNGJAYA.placeId,
    PHONE_OUTSIDE_CIREBON,
  )
  if (
    byPlaceId?.kind !== 'place' ||
    byPlaceId.placeId !== ES_TEH_JOMBLO_KEDUNGJAYA.placeId
  ) {
    throw new Error(
      'Es Teh Jomblo Kedungjaya must install by Place ID when the phone is outside Cirebon',
    )
  }
  const byName = activationLookup(
    ES_TEH_JOMBLO_KEDUNGJAYA.name,
    PHONE_OUTSIDE_CIREBON,
  )
  if (
    byName?.kind !== 'text' ||
    byName.pageSize !== ACTIVATION_NAME_SEARCH_PAGE_SIZE ||
    byName.locationBiasRadiusM !== null
  ) {
    throw new Error(
      'Name search must return up to 20 text matches and ignore the phone location',
    )
  }
  const nameBody = activationNameSearchBody(ES_TEH_JOMBLO_KEDUNGJAYA.name)
  if (
    nameBody.textQuery !== ES_TEH_JOMBLO_KEDUNGJAYA.name ||
    nameBody.pageSize !== ACTIVATION_NAME_SEARCH_PAGE_SIZE ||
    'locationBias' in nameBody ||
    'input' in nameBody
  ) {
    throw new Error(
      'Activation name search must be Text Search, not 5 Autocomplete predictions biased to the phone',
    )
  }
  const nearbyBody = nearbySearchBody(PHONE_OUTSIDE_CIREBON)
  const nearbyCircle = (
    nearbyBody.locationRestriction as { circle?: { radius?: number } }
  ).circle
  if (
    nearbyCircle?.radius !== ACTIVATION_NEARBY_RADIUS_M ||
    'textQuery' in nearbyBody ||
    nearbyBody.rankPreference !== 'DISTANCE'
  ) {
    throw new Error('Nearby activation list must stay 1.5km and keywordless')
  }
  const installedByPlaceId = await searchActivationPlaces({
    query: `places/${ES_TEH_JOMBLO_KEDUNGJAYA.placeId}`,
    loc: PHONE_OUTSIDE_CIREBON,
  })
  const installedPlace = installedByPlaceId.places[0]
  if (
    installedByPlaceId.places.length !== 1 ||
    installedPlace?.placeId !== ES_TEH_JOMBLO_KEDUNGJAYA.placeId
  ) {
    throw new Error(
      'Place ID lookup must return ChIJh-r8egDjbi4R3XOx3BwUu8I even when the phone is outside Cirebon',
    )
  }
  if (
    installedByPlaceId.source === 'google' &&
    !isEsTehJombloKedungjaya({
      placeId: installedPlace.placeId,
      name: installedPlace.name,
      address: installedPlace.address,
    })
  ) {
    throw new Error(
      `Place ID ${ES_TEH_JOMBLO_KEDUNGJAYA.placeId} resolved to ${installedPlace.name} / ${installedPlace.address ?? ''}, not Es Teh Jomblo in Kedungjaya, Cirebon`,
    )
  }

  const auto = await autocompletePlaces({ query: 'kopi susu' })
  const near = await nearbyPlaces({ loc: { lat: -6.2, lng: 106.816 } })
  const text = await textSearchPlaces({ query: 'kopi susu' })
  if (auto.places.length === 0) throw new Error('Expected autocomplete hits')
  if (near.places.length === 0) throw new Error('Expected nearby hits')
  if (text.places.length === 0) throw new Error('Expected text search hits')
  const cityScan = await scanCityPlaces({
    city: 'Cirebon',
    category: 'semua',
    potentialOnly: true,
  })
  if (cityScan.city.name.toLowerCase().includes('cirebon') === false) {
    throw new Error('City scan must resolve Cirebon')
  }
  if (cityScan.places.length < 3) {
    throw new Error('City scan must map multiple potential shops')
  }
  if (cityScan.places.some((place) => !isPotentialProspect(place))) {
    throw new Error('potentialOnly city scan must keep only easy-close shops')
  }
  const citySaved = await saveProspectBatch({
    places: cityScan.places,
    notes: 'Scan kota Cirebon',
    partnerRef: 'cirebon-map',
  })
  if (citySaved.created < 3) {
    throw new Error('City mapping must bulk-save potential shops')
  }
  const listedCity = await listProspects({ partner: 'cirebon-map' })
  if (listedCity.prospects.length < citySaved.created) {
    throw new Error('Mapped Cirebon shops must appear in the prospect list')
  }
  const oneTapBatch = await generateStockBatch({ count: 1, label: 'QA-ONE-TAP' })
  const oneTapCard = oneTapBatch.units[0]
  if (!oneTapCard) throw new Error('Expected one-tap card')
  const oneTapPlace = cityScan.places[0]
  if (!oneTapPlace) throw new Error('Expected a Cirebon shop for one-tap install')
  await expectReject(
    () =>
      attachPlaceToCard({
        sessionRole: 'ADMIN',
        place: oneTapPlace,
        notes: 'Scan kota Cirebon',
        partnerRef: 'cirebon-map',
      }),
    'Activation without the card in hand',
  )
  const oneTap = await attachPlaceToCard({
    sessionRole: 'ADMIN',
    place: oneTapPlace,
    publicId: oneTapCard.publicId,
    notes: 'Scan kota Cirebon',
    partnerRef: 'cirebon-map',
  })
  if (
    oneTap.publicId !== oneTapCard.publicId ||
    oneTap.outlet.placeId !== oneTapPlace.placeId
  ) {
    throw new Error('One-tap install must bind the next warehouse card to the mapped shop')
  }
  const trialProspect = oneTap.prospect
  if (
    trialProspect?.installState !== 'trial' ||
    trialProspect.installKind !== 'TRIAL' ||
    trialProspect.status !== 'CONTACTED' ||
    trialProspect.trialEndsAt == null
  ) {
    throw new Error('One-tap install must start a 7-day trial, not mark the shop sold')
  }
  const trialWindow = trialProspect.trialEndsAt - Date.now()
  const expectedWindow = DEFAULT_TRIAL_DAYS * 86_400_000
  if (Math.abs(trialWindow - expectedWindow) > 60_000) {
    throw new Error('Trial pickup date must be 7 days after install')
  }
  if (!trialProspect.pickupLabel.includes('Ambil')) {
    throw new Error('Trial prospect must show when the card should be collected')
  }
  const installed = (await listProspectInstalls()).find(
    (row) => row.googlePlaceId === oneTapPlace.placeId,
  )
  if (!installed || installed.installState !== 'trial') {
    throw new Error('City map must mark shops that already have a trial card')
  }
  await expectReject(
    () =>
      attachPlaceToCard({
        sessionRole: 'ADMIN',
        place: oneTapPlace,
        publicId: oneTapCard.publicId,
        notes: 'Scan kota Cirebon',
        partnerRef: 'cirebon-map',
      }),
    'Second trial on an active trial shop',
  )
  await expectReject(
    () => deleteProspect(trialProspect.id),
    'Delete while a trial card is still installed',
  )

  const dueBatch = await generateStockBatch({ count: 1, label: 'QA-TRIAL-DUE' })
  const dueCard = dueBatch.units[0]
  const duePlace = cityScan.places[1]
  if (!dueCard || !duePlace) throw new Error('Expected a second Cirebon shop for due trial')
  const dueTap = await attachPlaceToCard({
    sessionRole: 'ADMIN',
    place: duePlace,
    publicId: dueCard.publicId,
    notes: 'Scan kota Cirebon',
    partnerRef: 'cirebon-map',
    trialDays: 0,
  })
  if (dueTap.prospect?.installState !== 'due') {
    throw new Error('Expired trial must be due for collection')
  }
  const dueList = await listProspects({ install: 'due', partner: 'cirebon-map' })
  if (!dueList.prospects.some((row) => row.id === dueTap.prospect?.id) || dueList.summary.due < 1) {
    throw new Error('Due trials must appear in the pickup list')
  }
  const collected = await collectProspectTrial(dueTap.prospect.id)
  if (collected.installState !== 'collected' || collected.unitId != null) {
    throw new Error('Collecting a trial must free the shop and return the card')
  }
  const returned = await getActivationCard(dueCard.publicId)
  if (returned?.status !== 'IN_STOCK') {
    throw new Error('Collected trial card must go back to warehouse stock')
  }

  const soldTrial = await convertProspectToSold(trialProspect.id)
  if (soldTrial.installState !== 'sold' || soldTrial.status !== 'WON' || soldTrial.unitId == null) {
    throw new Error('Closing a trial must keep the card and mark the shop sold')
  }
  const stillActive = await getActivationCard(oneTapCard.publicId)
  if (stillActive?.status !== 'ACTIVE') {
    throw new Error('Closing a trial must leave the card installed')
  }
  if (prospectInstallState({ installKind: 'TRIAL', trialEndsAt: Date.now() - 1 }) !== 'due') {
    throw new Error('Past trial end date must be due')
  }
  if (!trialPickupLabel(Date.now() - 1).includes('hari ini')) {
    throw new Error('Overdue pickup label must say take it today')
  }
  if (
    near.places[0]?.rating == null ||
    near.places[0]?.userRatingCount == null ||
    text.places[0]?.rating == null
  ) {
    throw new Error('Stub places must expose Google rating and review count')
  }
  if (closingBand({ rating: 4.6, userRatingCount: 8 }) !== 'hot') {
    throw new Error('Few reviews must be a hot closing target')
  }
  if (closingBand({ rating: 4.8, userRatingCount: 200 }) !== 'cool') {
    throw new Error('Busy listings must be cooler closing targets')
  }
  if (!formatPlaceRating({ rating: 4.2, userRatingCount: 18 }).includes('18')) {
    throw new Error('Rating label must include review count')
  }
  if (!closingHint({ rating: 3.6, userRatingCount: 6 }).includes('rendah')) {
    throw new Error('Low-rating hint must mention the weak score')
  }
  console.log('places', {
    auto: auto.source,
    autoName: auto.places[0]?.name,
    near: near.source,
    nearName: near.places[0]?.name,
    nearRating: near.places[0]?.rating,
    nearReviews: near.places[0]?.userRatingCount,
  })

  const before = await resolveRedirect(tagged.publicId)
  console.log('before activate', before)
  const stockCard = await getActivationCard(tagged.publicId)
  if (!stockCard || stockCard.servicePackages.length !== 3) {
    throw new Error('Activation must load package settings')
  }
  if (typeof stockCard.whatsappGatewayOpen !== 'boolean') {
    throw new Error('Activation must know whether WhatsApp platform is OPEN')
  }

  const publicBatch = await generateStockBatch({ count: 1, label: 'QA-PUBLIC-ACTIVATE' })
  const publicCard = publicBatch.units[0]
  if (!publicCard) throw new Error('Expected public activation card')
  await expectReject(
    () => verifyActivationAccess({ publicId: publicCard.publicId }),
    'Public activation without PIN',
  )
  await expectReject(
    () =>
      activateUnit({
        publicId: publicCard.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      }),
    'Public activation without PIN',
  )

  await expectReject(
    () =>
      activateUnit({
        publicId: tagged.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        sessionOwnerId: 'foreign-user',
        sessionRole: 'USER',
      }),
    'A logged-in user activating an unassigned card without PIN',
  )
  await expectReject(
    () =>
      activateUnit({
        publicId: tagged.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2580',
      }),
    'Activating an unassigned card before a holder exists',
  )

  const holder = await createHolder({
    email: `holder-${tagged.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    name: 'Smoke Holder',
    pin: '2580',
  })
  if (holder.pin !== '2580') throw new Error('Requested holder PIN must be stored')
  await expectReject(
    () =>
      activateUnit({
        publicId: tagged.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2580',
        serviceTier: 'PLUS',
      }),
    'Plus activation without owner number',
  )
  await expectReject(
    () =>
      activateUnit({
        publicId: tagged.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2580',
        serviceTier: 'PRO',
      }),
    'Pro activation without owner number',
  )
  const withPartner = await activateUnit({
    publicId: tagged.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    partnerRef: 'smoke-sales',
    pin: '2580',
  })
  if ((await getActivationCard(tagged.publicId))?.ownerId !== holder.id) {
    throw new Error('Unassigned activation with PIN must claim the holder')
  }
  await assignUnitToHolder({ ownerId: holder.id, publicId: plain.publicId })
  await expectReject(
    () =>
      activateUnit({
        publicId: plain.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2581',
      }),
    'Wrong holder PIN',
  )
  await expectReject(
    () => createHolder({ email: holder.email, password: 'smoke-holder-12', pin: '0000' }),
    'Trivial holder PIN',
  )

  const withoutPartner = await activateUnit({
    publicId: plain.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    pin: '2580',
  })
  const summaryAfterActivation = await getAdminDashboardSummary()
  if (
    summaryAfterActivation.readyStockCount !==
    summaryBeforeBatch.readyStockCount
  ) {
    throw new Error('Activated cards must leave ready warehouse stock')
  }
  console.log('activated', {
    tagged: { publicId: withPartner.publicId, partner: withPartner.partnerRef },
    plain: { publicId: withoutPartner.publicId, partner: withoutPartner.partnerRef },
  })

  const after = await resolveRedirect(tagged.publicId)
  console.log('after activate', after)

  if (after.kind !== 'google') {
    throw new Error('Expected Google redirect after activation')
  }
  await logClick({ unitId: after.unitId, userAgent: 'test', ip: '127.0.0.1' })
  await logClick({ unitId: after.unitId, userAgent: 'test', ip: '127.0.0.1' })
  const clickRows = await db.query.clicks.findMany({
    where: (click, { eq: equals }) => equals(click.unitId, after.unitId),
  })
  if (clickRows.length !== 1) {
    throw new Error('Repeated clicks in one window must be deduplicated')
  }
  console.log('click logged')

  const taggedRow = await db.query.units.findFirst({
    where: eq(units.publicId, tagged.publicId),
    with: { outlet: true },
  })
  const plainRow = await db.query.units.findFirst({
    where: eq(units.publicId, plain.publicId),
  })
  if (taggedRow?.partnerRef !== 'smoke-sales') {
    throw new Error('Expected partner tag to persist')
  }
  if (plainRow?.partnerRef) {
    throw new Error('Partner tag must stay optional')
  }
  if (!taggedRow?.nfcEncodedAt) {
    throw new Error('Expected nfcEncodedAt after encode')
  }
  console.log('db status', taggedRow?.status, taggedRow?.outlet?.googlePlaceId)

  if (!plainRow) throw new Error('Expected plain unit row')
  const basicKept = await updateUnitReviewSettings({
    unitId: plainRow.id,
    serviceTier: 'BASIC',
    reviewMode: 'GOOGLE_DIRECT',
    ownerWhatsapp: '081234567890',
  })
  if (
    !basicKept.ok ||
    basicKept.ownerWhatsapp !== null ||
    basicKept.reviewMode !== 'GOOGLE_DIRECT'
  ) {
    throw new Error('Basic must ignore owner WhatsApp and stay on Google direct')
  }
  await expectReject(
    () =>
      updateUnitReviewSettings({
        unitId: plainRow.id,
        serviceTier: 'PLUS',
        reviewMode: 'OWNER_WHATSAPP',
      }),
    'Plus WhatsApp owner without a number',
  )
  await updateUnitReviewSettings({
    unitId: plainRow.id,
    serviceTier: 'PLUS',
    reviewMode: 'OWNER_WHATSAPP',
    ownerWhatsapp: '081234567890',
  })
  const ownerLow = await resolveFeedbackDestination({
    publicId: plain.publicId,
    rating: 3,
  })
  if (ownerLow.kind !== 'owner_whatsapp' || !ownerLow.url.includes('6281234567890')) {
    throw new Error('Plus mode must open the normalized owner WhatsApp number')
  }
  const ownerHigh = await resolveFeedbackDestination({
    publicId: plain.publicId,
    rating: 5,
  })
  if (ownerHigh.kind !== 'google') {
    throw new Error('High ratings must continue to Google Review')
  }
  await setSmokeGateway('OFFLINE')
  const proOffline = await updateUnitReviewSettings({
    unitId: plainRow.id,
    serviceTier: 'PRO',
    ownerWhatsapp: '6281234567890',
  })
  if (!proOffline.ok) {
    throw new Error('Existing Pro cards must still save while WhatsApp is down')
  }
  if ((await resolveRedirect(plain.publicId)).kind !== 'feedback') {
    throw new Error('Pro guests must keep the feedback page while WhatsApp is down')
  }
  if (!(await getPublicFeedbackCard(plain.publicId))) {
    throw new Error('Pro feedback form must remain visible while WhatsApp is down')
  }
  const anonymousOffline = await resolveFeedbackDestination({
    publicId: plain.publicId,
    rating: 2,
  })
  if (anonymousOffline.kind !== 'anonymous') {
    throw new Error('Pro low ratings must open anonymous feedback while offline')
  }
  await setSmokeGateway('OPEN')
  const anonymous = await resolveFeedbackDestination({
    publicId: plain.publicId,
    rating: 2,
  })
  if (anonymous.kind !== 'anonymous') {
    throw new Error('Pro low ratings must open anonymous feedback')
  }
  await db
    .update(reviewFeedbacks)
    .set({
      status: 'FAILED',
      deliveryError: 'smoke-drain',
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      or(
        eq(reviewFeedbacks.status, 'QUEUED'),
        eq(reviewFeedbacks.status, 'PROCESSING'),
        eq(reviewFeedbacks.status, 'UNCERTAIN'),
      ),
    )
  await db
    .update(whatsappOutbox)
    .set({
      status: 'FAILED',
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      or(
        eq(whatsappOutbox.status, 'QUEUED'),
        eq(whatsappOutbox.status, 'PROCESSING'),
        eq(whatsappOutbox.status, 'UNCERTAIN'),
      ),
    )
  const submissionId = crypto.randomUUID()
  await submitAnonymousFeedback({
    publicId: plain.publicId,
    rating: 2,
    message: 'smoke feedback',
    submissionId,
  })
  await submitAnonymousFeedback({
    publicId: plain.publicId,
    rating: 2,
    message: 'smoke feedback',
    submissionId,
  })
  const feedback = await listUnitFeedback(plainRow.id)
  if (feedback.length !== 1 || feedback[0]?.status !== 'QUEUED') {
    throw new Error('Anonymous feedback must be queued and idempotent')
  }
  await db
    .insert(whatsappGatewayState)
    .values({
      id: 'primary',
      status: 'OPEN',
      workerId: 'smoke-worker',
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappGatewayState.id,
      set: {
        status: 'OPEN',
        workerId: 'smoke-worker',
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      },
    })
  await db
    .update(whatsappCommands)
    .set({ status: 'FAILED', error: 'smoke-drain' })
    .where(eq(whatsappCommands.status, 'PENDING'))
  const command = await queueWhatsappCommand('CONNECT')
  const waiting = await pollWhatsappGateway({
    workerId: 'smoke-worker',
    connected: false,
  })
  if (waiting.command?.id !== command.id || waiting.job) {
    throw new Error('Gateway poll must return commands without claiming offline jobs')
  }
  await reportWhatsappGateway({
    workerId: 'smoke-worker',
    status: 'OPEN',
    command: { id: command.id, status: 'ACKNOWLEDGED' },
  })
  const claimed = await pollWhatsappGateway({
    workerId: 'smoke-worker',
    connected: true,
  })
  if (claimed.job?.id !== submissionId) {
    throw new Error('Connected gateway must claim one queued feedback job')
  }
  await reportWhatsappGateway({
    workerId: 'smoke-worker',
    status: 'OPEN',
    job: {
      id: submissionId,
      status: 'DELIVERED',
      messageId: 'smoke-message',
    },
  })
  const delivered = await listUnitFeedback(plainRow.id)
  if (delivered[0]?.status !== 'DELIVERED') {
    throw new Error('Gateway delivery report must update feedback status')
  }
  const gatewayStatus = await getWhatsappGatewayStatus()
  if (gatewayStatus.status !== 'OPEN' || gatewayStatus.pending !== 0) {
    throw new Error('Gateway status must reflect the active worker and empty queue')
  }
  console.log('review modes', { owner: ownerLow.kind, anonymous: feedback.length })
  await checkServicePackages(plainRow.id, plain.publicId)
  await checkHolderAccounts()
  await checkBusinessQa()
  await checkStockOwnership()
  await checkTrialOwnership()
  await checkActivationPinSwitch()

  const uiKey = 'AIzaSySmokeGooglePlacesKey12345678'
  await saveGooglePlacesKey(uiKey)
  const googleSettings = await getGooglePlacesPublicSettings()
  if (googleSettings.source !== 'ui' || (await resolveGoogleMapsApiKey()) !== uiKey) {
    throw new Error('Google API key from admin UI must be used for Places')
  }
  await clearGooglePlacesKey()
  if ((await resolveGoogleMapsApiKey()).length > 0) {
    throw new Error('Clearing UI Google key must drop the stored secret')
  }
  const hook = 'https://example.com/affiliate-hook'
  await saveAffiliateWebhookUrl(hook)
  const hookSettings = await getAffiliateWebhookPublicSettings()
  if (hookSettings.source !== 'ui' || (await resolveAffiliateWebhookUrl()) !== hook) {
    throw new Error('Affiliate webhook from admin UI must override env')
  }
  await clearAffiliateWebhookUrl()
  if ((await resolveAffiliateWebhookUrl()).length > 0) {
    throw new Error('Clearing UI affiliate webhook must drop the stored URL')
  }
  try {
    normalizeAffiliateWebhookUrl('https://169.254.169.254/latest/meta-data')
    throw new Error('Private webhook URL must be rejected')
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Private webhook URL must be rejected'
    ) {
      throw error
    }
  }
  await saveSiteFlags({ homeEnabled: false, affiliateEnabled: false })
  const closed = await getPublicSiteFlags()
  if (closed.homeEnabled || closed.affiliateEnabled) {
    throw new Error('Public home and affiliate pages must be switchable off')
  }
  const closedLead = await submitAffiliateLead({
    nama: 'Tes Tutup',
    email: 'tes-tutup@example.com',
    whatsapp: '081234567890',
    platforms: ['instagram'],
    usernames: { instagram: 'tes' },
  })
  if (closedLead.ok) {
    throw new Error('Affiliate signup must reject when the public page is off')
  }
  await saveSiteFlags({ homeEnabled: true, affiliateEnabled: true })

  const leftover = await generateStockBatch({ count: 2, label: 'QA-READY' })
  const keep = leftover.units[0]
  const drop = leftover.units[1]
  if (!keep || !drop) throw new Error('Expected leftover batch units')
  await db.delete(units).where(eq(units.publicId, drop.publicId))
  await markNfcEncoded(keep.publicId)
  const readyBatch = (await listStockBatches()).find((b) => b.id === leftover.batchId)
  if (!readyBatch || readyBatch.remaining !== 1 || readyBatch.next !== 'ready') {
    throw new Error('Batch must be ready when remaining cards are encoded')
  }

  const buckets = Array.from({ length: 15 }, (_, index) => ({
    date: `day-${index + 1}`,
    count: index + 1,
  }))
  const windows = summarizeClickBuckets(buckets)
  if (windows.clicksToday !== 15) {
    throw new Error('Today must use the newest reporting bucket')
  }
  if (windows.clicksLast7Days !== 77) {
    throw new Error('Current trend window must use seven completed days')
  }
  if (windows.clicksPrevious7Days !== 28) {
    throw new Error('Previous trend window must use the prior seven days')
  }
  if (
    windows.daily.length !== 14 ||
    windows.daily[0]?.date !== 'day-2' ||
    windows.daily.at(-1)?.date !== 'day-15'
  ) {
    throw new Error('Dashboard chart must retain exactly 14 latest buckets')
  }
  await saveActivationPinEnabled(pinWasEnabled)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
