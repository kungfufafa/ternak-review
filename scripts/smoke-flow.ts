import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

// Deterministic gate: stub Places unless SMOKE_LIVE_PLACES=1.
if (process.env.CI || process.env.SMOKE_LIVE_PLACES !== '1') {
  process.env.GOOGLE_MAPS_API_KEY = ''
}
if (process.env.CI) {
  process.env.DATABASE_URL ??= 'file:./data/ci.db'
}

import {
  generateStockBatch,
  getBatchPrintData,
  listStockBatches,
} from '../src/server/stock.ts'
import { markNfcEncoded } from '../src/server/nfc.ts'
import {
  activateUnit,
  getActivationCard,
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
import { requestLoginOtp, verifyLoginOtp } from '../src/server/otp-login.ts'
import { isSmtpReady, saveSmtpSettings, sendAppEmail } from '../src/server/smtp.ts'
import { listOutboundLogs } from '../src/server/outbox.ts'
import {
  autocompletePlaces,
  nearbyPlaces,
} from '../src/server/places.ts'
import { eq, or } from 'drizzle-orm'
import { db } from '../src/db/index.ts'
import { reviewFeedbacks, units, whatsappCommands, whatsappGatewayState, whatsappOutbox } from '../src/db/schema.ts'
import {
  getAdminDashboardSummary,
  getUnitDetail,
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

async function checkServicePackages(unitId: string, publicId: string) {
  const modes = [
    { serviceTier: 'PLUS', reviewMode: 'OWNER_WHATSAPP', kind: 'owner_whatsapp' },
    { serviceTier: 'PRO', reviewMode: 'OWNER_WHATSAPP', kind: 'owner_whatsapp' },
    { serviceTier: 'PRO', reviewMode: 'ANONYMOUS_WHATSAPP', kind: 'anonymous' },
  ] as const

  for (const { serviceTier, reviewMode, kind } of modes) {
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
      reviewMode,
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
          throw new Error(`${serviceTier}/${reviewMode}: rating ${rating} at threshold ${interceptMaxRating} must resolve to ${expected}`)
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

  for (const serviceTier of ['PLUS', 'PRO', 'BASIC'] as const) {
    const settings = await updateUnitReviewSettings({
      unitId,
      serviceTier,
      // Downgrading an anonymous card to Basic must normalize it to direct.
      reviewMode: serviceTier === 'BASIC' ? 'ANONYMOUS_WHATSAPP' : 'GOOGLE_DIRECT',
      ownerWhatsapp: '081234567890',
    })
    if (!settings.ok || settings.reviewMode !== 'GOOGLE_DIRECT') {
      throw new Error('Direct selection and Basic downgrade must persist Google Direct')
    }
    if ((await resolveRedirect(publicId)).kind !== 'google' || await getPublicFeedbackCard(publicId)) {
      throw new Error(`${serviceTier} in direct mode must skip the rating page`)
    }
    for (let rating = 1; rating <= 5; rating++) {
      if ((await resolveFeedbackDestination({ publicId, rating })).kind !== 'google') {
        throw new Error(`${serviceTier} in direct mode must send every rating to Google`)
      }
    }
    await expectReject(
      () => submitAnonymousFeedback({
        publicId,
        rating: 1,
        message: 'Stale anonymous form after a mode change',
        submissionId: crypto.randomUUID(),
      }),
      'Anonymous submission after switching to direct mode',
    )
  }
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
  const other = await createHolder({
    email: `holder-c-${cardB.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    pin: '2581',
  })
  await assignUnitToHolder({ ownerId: holder.id, publicId: cardA.publicId })
  await assignUnitToHolder({ ownerId: holder.id, publicId: cardB.publicId })

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
        pin: '2580',
      }),
    'Unassigned card with a valid PIN',
  )

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

  if (await isSmtpReady()) {
    throw new Error('SMTP must stay off until admin enables it')
  }
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

async function main() {
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

  const auto = await autocompletePlaces({ query: 'kopi susu' })
  const near = await nearbyPlaces({ loc: { lat: -6.2, lng: 106.816 } })
  if (auto.places.length === 0) throw new Error('Expected autocomplete hits')
  if (near.places.length === 0) throw new Error('Expected nearby hits')
  console.log('places', {
    auto: auto.source,
    autoName: auto.places[0]?.name,
    near: near.source,
    nearName: near.places[0]?.name,
  })

  const before = await resolveRedirect(tagged.publicId)
  console.log('before activate', before)

  await expectReject(
    () =>
      activateUnit({
        publicId: tagged.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2580',
      }),
    'Activating an unassigned card',
  )

  const holder = await createHolder({
    email: `holder-${tagged.publicId.toLowerCase()}@smoke.test`,
    password: 'smoke-holder-12',
    name: 'Smoke Holder',
    pin: '2580',
  })
  if (holder.pin !== '2580') throw new Error('Requested holder PIN must be stored')
  await assignUnitToHolder({ ownerId: holder.id, publicId: tagged.publicId })
  await assignUnitToHolder({ ownerId: holder.id, publicId: plain.publicId })
  await expectReject(
    () =>
      activateUnit({
        publicId: tagged.publicId,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        pin: '2581',
      }),
    'Wrong holder PIN',
  )
  await expectReject(
    () => createHolder({ email: holder.email, password: 'smoke-holder-12', pin: '0000' }),
    'Trivial holder PIN',
  )

  const withPartner = await activateUnit({
    publicId: tagged.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    partnerRef: 'smoke-sales',
    pin: '2580',
  })
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
  await updateUnitReviewSettings({
    unitId: plainRow.id,
    serviceTier: 'PRO',
    reviewMode: 'ANONYMOUS_WHATSAPP',
    ownerWhatsapp: '6281234567890',
  })
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
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
