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
import { activateUnit } from '../src/server/activation.ts'
import { resolveRedirect, logClick } from '../src/server/redirect.ts'
import {
  autocompletePlaces,
  nearbyPlaces,
} from '../src/server/places.ts'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.ts'
import { units } from '../src/db/schema.ts'

async function main() {
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

  const withPartner = await activateUnit({
    publicId: tagged.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    partnerRef: 'smoke-sales',
  })
  const withoutPartner = await activateUnit({
    publicId: plain.publicId,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  })
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
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
