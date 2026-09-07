import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import QRCode from 'qrcode'

const MM = 72 / 25.4
const mm = (value: number) => value * MM

const PAGE_SHEET = { width: mm(100), height: mm(100) }
const PAGE_A4 = { width: mm(210), height: mm(297) }
const CARD = 98
const A4_GAP = 5
const CARDS_PER_A4 = 4

const C = {
  red: rgb(0xea / 255, 0x43 / 255, 0x35 / 255),
  yellow: rgb(0xfb / 255, 0xbc / 255, 0x05 / 255),
  green: rgb(0x34 / 255, 0xa8 / 255, 0x53 / 255),
  blue: rgb(0x42 / 255, 0x85 / 255, 0xf4 / 255),
  ink: rgb(0x20 / 255, 0x21 / 255, 0x24 / 255),
  mute: rgb(0x3c / 255, 0x40 / 255, 0x43 / 255),
  kicker: rgb(0x5f / 255, 0x63 / 255, 0x68 / 255),
  star: rgb(0xfb / 255, 0xbc / 255, 0x04 / 255),
  wash: rgb(0xee / 255, 0xf1 / 255, 0xf4 / 255),
  cta: rgb(0x0b / 255, 0x57 / 255, 0xd0 / 255),
  or: rgb(0x80 / 255, 0x86 / 255, 0x8b / 255),
  white: rgb(1, 1, 1),
  mark: rgb(0.04, 0.04, 0.04),
  markR: rgb(0x1a / 255, 0x73 / 255, 0xe8 / 255),
}

const STAR =
  'M12 21.6 14.7 15.7l6.5-.9-4.7-4.6 1.1-6.4L12 6.8 6.4 3.8l1.1 6.4L2.8 14.8l6.5.9z'

export type PrintCard = {
  publicId: string
  redirectUrl: string
}

export type PrintPdfLayout = 'sheet' | 'a4'

function roundedRectPath(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  return [
    `M ${r} 0`,
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `V ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ')
}

function fillRound(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: RGB,
) {
  page.drawSvgPath(roundedRectPath(width, height, radius), {
    x,
    y: y + height,
    color,
  })
}

function strokeRound(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  borderColor: RGB,
  borderWidth: number,
) {
  page.drawSvgPath(roundedRectPath(width, height, radius), {
    x,
    y: y + height,
    borderColor,
    borderWidth,
  })
}

function centerText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  cx: number,
  y: number,
  size: number,
  color: RGB,
) {
  const width = font.widthOfTextAtSize(text, size)
  page.drawText(text, {
    x: cx - width / 2,
    y,
    size,
    font,
    color,
  })
}

function drawQr(
  page: PDFPage,
  url: string,
  x: number,
  y: number,
  size: number,
) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const cell = size / n
  for (let row = 0; row < n; row++) {
    let col = 0
    while (col < n) {
      if (!qr.modules.get(row, col)) {
        col += 1
        continue
      }
      let span = 1
      while (col + span < n && qr.modules.get(row, col + span)) span += 1
      page.drawRectangle({
        x: x + col * cell,
        y: y + (n - 1 - row) * cell,
        width: span * cell,
        height: cell,
        color: C.ink,
      })
      col += span
    }
  }
}

function drawCard(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  originX: number,
  originY: number,
  url: string,
) {
  const s = mm(CARD)
  const u = s / 100
  const x = originX
  const y = originY
  const half = s / 2

  page.drawRectangle({ x, y: y + half, width: half, height: half, color: C.red })
  page.drawRectangle({
    x: x + half,
    y: y + half,
    width: half,
    height: half,
    color: C.yellow,
  })
  page.drawRectangle({
    x: x + half,
    y,
    width: half,
    height: half,
    color: C.green,
  })
  page.drawRectangle({ x, y, width: half, height: half, color: C.blue })

  const inset = 2.55 * u
  page.drawRectangle({
    x: x + inset,
    y: y + inset,
    width: s - inset * 2,
    height: s - inset * 2,
    color: C.white,
  })

  const cx = x + s / 2
  const padX = 5.4 * u
  let top = y + s - inset - 4.6 * u

  const mark = 3.2 * u
  const merchantSize = 2.3 * u
  const merchant = '@TernakReview'
  const merchantW = fonts.bold.widthOfTextAtSize(merchant, merchantSize)
  const merchantX = cx - (mark + 0.85 * u + merchantW) / 2
  fillRound(page, merchantX, top - mark, mark, mark, 0.7 * u, C.mark)
  page.drawRectangle({
    x: merchantX + mark * 0.48,
    y: top - mark + mark * 0.18,
    width: mark * 0.4,
    height: mark * 0.64,
    color: C.markR,
  })
  page.drawText(merchant, {
    x: merchantX + mark + 0.85 * u,
    y: top - mark + (mark - merchantSize) / 2,
    size: merchantSize,
    font: fonts.bold,
    color: C.mute,
  })
  top -= mark + 1.8 * u

  const kickerSize = 2.05 * u
  centerText(
    page,
    fonts.bold,
    'BANTU KAMI DENGAN',
    cx,
    top - kickerSize,
    kickerSize,
    C.kicker,
  )
  top -= kickerSize + 0.55 * u

  const titleSize = 8.4 * u
  centerText(
    page,
    fonts.bold,
    'Google Review',
    cx,
    top - titleSize * 0.78,
    titleSize,
    C.ink,
  )
  top -= titleSize * 0.9 + 1.2 * u

  const starBox = 4.6 * u
  const starGap = 0.8 * u
  const starsW = 5 * starBox + 4 * starGap
  let starX = cx - starsW / 2
  const starScale = starBox / 24
  for (let i = 0; i < 5; i++) {
    page.drawSvgPath(STAR, {
      x: starX,
      y: top - starBox,
      scale: starScale,
      color: C.star,
    })
    starX += starBox + starGap
  }
  top -= starBox + 3.4 * u

  const promptSize = 2.5 * u
  centerText(
    page,
    fonts.regular,
    'Tap atau scan untuk memberi ulasan',
    cx,
    top - promptSize,
    promptSize,
    C.mute,
  )
  top -= promptSize + 2 * u

  const box = 32 * u
  const orSize = 2.1 * u
  const orW = fonts.bold.widthOfTextAtSize('ATAU', orSize)
  const colGap = 2.2 * u
  const row = box
  const actionsW = box + colGap + orW + colGap + box
  const actionsX = cx - actionsW / 2
  const boxY = top - row
  const nfcX = actionsX
  const qrX = actionsX + box + colGap + orW + colGap

  fillRound(page, nfcX, boxY, box, box, 4 * u, C.wash)
  fillRound(page, qrX, boxY, box, box, 4 * u, C.wash)

  const phoneW = box * 0.3
  const phoneH = box * 0.58
  strokeRound(
    page,
    nfcX + box * 0.16,
    boxY + (box - phoneH) / 2,
    phoneW,
    phoneH,
    2.2 * u,
    C.ink,
    1.15 * u,
  )
  page.drawLine({
    start: { x: nfcX + box * 0.22, y: boxY + box * 0.72 },
    end: { x: nfcX + box * 0.4, y: boxY + box * 0.72 },
    thickness: 1.05 * u,
    color: C.ink,
  })

  const waveX = nfcX + box * 0.62
  const waveY = boxY + box / 2
  for (const r of [box * 0.1, box * 0.16, box * 0.22]) {
    page.drawSvgPath(
      `M ${-r * 0.15} ${-r} A ${r} ${r} 0 0 1 ${-r * 0.15} ${r}`,
      {
        x: waveX,
        y: waveY,
        borderColor: C.ink,
        borderWidth: 1.05 * u,
      },
    )
  }

  const qrPad = 2.4 * u
  page.drawRectangle({
    x: qrX + qrPad,
    y: boxY + qrPad,
    width: box - qrPad * 2,
    height: box - qrPad * 2,
    color: C.white,
  })
  drawQr(
    page,
    url,
    qrX + qrPad,
    boxY + qrPad,
    box - qrPad * 2,
  )

  centerText(
    page,
    fonts.bold,
    'ATAU',
    actionsX + box + colGap + orW / 2,
    boxY + box / 2 - orSize / 3,
    orSize,
    C.or,
  )

  const labelSize = 2.8 * u
  const labelY = boxY - 1.5 * u - labelSize
  centerText(page, fonts.bold, 'Tap NFC', nfcX + box / 2, labelY, labelSize, C.ink)
  centerText(page, fonts.bold, 'Scan QR', qrX + box / 2, labelY, labelSize, C.ink)

  const ctaH = 6.7 * u
  const ctaY = y + inset + 4 * u
  fillRound(page, x + padX, ctaY, s - padX * 2, ctaH, 2 * u, C.cta)
  const ctaSize = 2.5 * u
  centerText(
    page,
    fonts.bold,
    'Pendapat Anda berarti bagi kami',
    cx,
    ctaY + (ctaH - ctaSize) / 2,
    ctaSize,
    C.white,
  )
}

function a4Slots() {
  const card = mm(CARD)
  const gap = mm(A4_GAP)
  const gridW = card * 2 + gap
  const gridH = card * 2 + gap
  const left = (PAGE_A4.width - gridW) / 2
  const bottom = (PAGE_A4.height - gridH) / 2
  return [
    { x: left, y: bottom + card + gap },
    { x: left + card + gap, y: bottom + card + gap },
    { x: left, y: bottom },
    { x: left + card + gap, y: bottom },
  ]
}

export function printPdfFilename(label: string, count: number) {
  const safe = label
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'TernakReview'
  return `${safe}-${count}kartu.pdf`
}

export async function buildPrintPdf(input: {
  cards: PrintCard[]
  layout: PrintPdfLayout
  onProgress?: (done: number, total: number) => void
}) {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  const total = input.cards.length
  const sheet = input.layout !== 'a4'
  const slots = sheet ? [{ x: mm((100 - CARD) / 2), y: mm((100 - CARD) / 2) }] : a4Slots()
  const perPage = sheet ? 1 : CARDS_PER_A4

  for (let i = 0; i < total; i += perPage) {
    const page = doc.addPage(sheet ? [PAGE_SHEET.width, PAGE_SHEET.height] : [PAGE_A4.width, PAGE_A4.height])
    page.drawRectangle({
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
      color: C.white,
    })
    const slice = input.cards.slice(i, i + perPage)
    slice.forEach((card, index) => {
      const slot = slots[index]
      if (!slot) return
      drawCard(page, fonts, slot.x, slot.y, card.redirectUrl)
    })
    input.onProgress?.(Math.min(i + slice.length, total), total)
    if (i % 16 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  return doc.save({ useObjectStreams: false })
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string,
) {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  const blob = new Blob([copy], { type: mime })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}
