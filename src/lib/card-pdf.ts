import {
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib'
import QRCode from 'qrcode'
import {
  DEFAULT_CARD_DESIGN,
  defaultCardDesign,
  isFreeDesign,
  type CardDesign,
  type CardElement,
} from '#/lib/card-design'

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

function fitCenterText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  cx: number,
  y: number,
  size: number,
  color: RGB,
  maxWidth: number,
) {
  let fitted = size
  while (fitted > 0.8 && font.widthOfTextAtSize(text, fitted) > maxWidth) {
    fitted -= 0.1
  }
  centerText(page, font, text, cx, y, fitted, color)
}

function hexToRgb(hex: string): RGB {
  const value = Number.parseInt(hex.slice(1), 16)
  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  )
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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

// Huruf T/R merek — bentuk sama dengan BrandMark SVG (viewBox 64). Path
// sudah ditransformasi ke koordinat viewBox (y ke bawah) dan digambar
// dengan konvensi yang sama seperti ikon NFC hand: anchor pojok kiri-atas.
const BRAND_T =
  'M6.216 23.62 L6.216 17.1 L32.096 17.1 L32.096 23.62 ' +
  'L23.136 23.62 L23.136 46.9 L15.176 46.9 L15.176 23.62 Z'
const BRAND_R =
  'M32.864 46.9 V17.1 H45.704 Q49.024 17.1 51.514 18.31 ' +
  'Q54.004 19.52 55.394 21.79 Q56.784 24.06 56.784 27.22 ' +
  'Q56.784 30.42 55.364 32.62 Q53.944 34.82 51.384 35.94 ' +
  'Q48.824 37.06 45.424 37.06 H37.744 V30.78 H43.784 ' +
  'Q45.224 30.78 46.244 30.42 Q47.264 30.06 47.804 29.28 ' +
  'Q48.344 28.5 48.344 27.22 Q48.344 25.94 47.804 25.14 ' +
  'Q47.264 24.34 46.244 23.96 Q45.224 23.58 43.784 23.58 ' +
  'H40.944 V46.9 Z ' +
  'M49.024 46.9 L41.704 33.22 H50.304 L57.784 46.9 Z'

function drawBrandMark(page: PDFPage, x: number, y: number, size: number) {
  const k = size / 64
  const top = y + size
  page.drawRectangle({ x, y, width: size, height: size, color: C.mark })
  page.drawSvgPath(BRAND_T, {
    x,
    y: top,
    scale: k,
    color: C.white,
  })
  page.drawSvgPath(BRAND_R, {
    x,
    y: top,
    scale: k,
    color: C.markR,
  })
}

function drawLogoAt(
  page: PDFPage,
  logo: PDFImage | null,
  cx: number,
  cy: number,
  size: number,
) {
  if (logo) {
    const scale = Math.min(size / logo.width, size / logo.height)
    page.drawImage(logo, {
      x: cx - (logo.width * scale) / 2,
      y: cy - (logo.height * scale) / 2,
      width: logo.width * scale,
      height: logo.height * scale,
    })
  } else {
    drawBrandMark(page, cx - size / 2, cy - size / 2, size)
  }
}

// Path gelombang + posisi titik ikon tap — sama persis dengan NfcIconSvg
// (viewBox 64) supaya pratinjau dan PDF identik.
const TAP_WAVES = [
  'M40 23c5 5 5 14 0 19',
  'M46 17c7.6 7.6 7.6 22.4 0 30',
  'M52 11.5c10.6 10.6 10.6 30.4 0 41',
]

function drawNfcTapIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  ink: RGB,
  strokeWidth: number,
) {
  const k = size / 64
  const left = cx - size / 2
  const svgTop = cy + size / 2
  // Kotak HP: rect x6 y9 w24 h46 rx4.4 pada viewBox 64.
  strokeRound(
    page,
    left + 6 * k,
    svgTop - 55 * k,
    24 * k,
    46 * k,
    4.4 * k,
    ink,
    strokeWidth,
  )
  // Garis speaker: M12.5 14.4h11.
  page.drawLine({
    start: { x: left + 12.5 * k, y: svgTop - 14.4 * k },
    end: { x: left + 23.5 * k, y: svgTop - 14.4 * k },
    thickness: strokeWidth,
    color: ink,
  })
  // Titik home: circle cx18 cy49 r1.8 (terisi penuh).
  page.drawCircle({
    x: left + 18 * k,
    y: svgTop - 49 * k,
    size: 1.8 * k,
    color: ink,
  })
  for (const path of TAP_WAVES) {
    page.drawSvgPath(path, {
      x: left,
      y: svgTop,
      scale: k,
      borderColor: ink,
      borderWidth: strokeWidth,
    })
  }
}

// Paths in the 64-unit hand icon viewBox, drawn verbatim — pdf-lib flips
// the y axis for drawSvgPath, matching SVG semantics.
const HAND_BOWL = 'M11 38c.6 9.6 8 16 17.4 16h7.2c9.4 0 16.8-6.4 17.4-16'
const HAND_WAVES = [
  'M46 25c3.4 3.4 3.4 9.6 0 13',
  'M52 21c5.6 5.6 5.6 15.4 0 21',
  'M58 17c7.8 7.8 7.8 21.4 0 29.2',
]

function drawNfcHandIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  ink: RGB,
  strokeWidth: number,
) {
  const k = size / 64
  const left = cx - size / 2
  const svgTop = cy + size / 2
  strokeRound(
    page,
    left + 18 * k,
    svgTop - 42 * k,
    22 * k,
    38 * k,
    4 * k,
    ink,
    strokeWidth,
  )
  page.drawLine({
    start: { x: left + 23 * k, y: svgTop - 9 * k },
    end: { x: left + 35 * k, y: svgTop - 9 * k },
    thickness: strokeWidth * 0.9,
    color: ink,
  })
  for (const path of [HAND_BOWL, ...HAND_WAVES]) {
    page.drawSvgPath(path, {
      x: left,
      y: svgTop,
      scale: k,
      borderColor: ink,
      borderWidth: strokeWidth,
    })
  }
}

function drawNfcIcon(
  page: PDFPage,
  icon: 'tap' | 'hand',
  cx: number,
  cy: number,
  size: number,
  ink: RGB,
  strokeWidth: number,
) {
  if (icon === 'hand') {
    drawNfcHandIcon(page, cx, cy, size, ink, strokeWidth)
  } else {
    drawNfcTapIcon(page, cx, cy, size, ink, strokeWidth)
  }
}

function mixOver(base: RGB, t: number): RGB {
  // Blend a 0..1 channel value over white to fake alpha in pdf-lib.
  return rgb(1 - t + base.red * t, 1 - t + base.green * t, 1 - t + base.blue * t)
}

// Meniru wrap pratinjau CSS (pre-wrap + word-break: break-word): pecah di
// spasi, dan kata yang sendirian melebihi lebar kotak dipotong per karakter.
function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
        continue
      }
      if (current) {
        lines.push(current)
        current = ''
      }
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word
        continue
      }
      for (const ch of word) {
        if (current && font.widthOfTextAtSize(current + ch, size) > maxWidth) {
          lines.push(current)
          current = ''
        }
        current += ch
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function drawFrame(page: PDFPage, design: CardDesign, x: number, y: number, s: number, face: RGB) {
  const half = s / 2
  const d = design
  if (d.border === 'google') {
    // Urutan kuadran mengikuti conic-gradient CSS (dari atas, searah jarum
    // jam): merah kanan-atas, kuning kanan-bawah, hijau kiri-bawah, biru
    // kiri-atas — supaya PDF sama dengan pratinjau.
    page.drawRectangle({ x: x + half, y: y + half, width: half, height: half, color: C.red })
    page.drawRectangle({ x: x + half, y, width: half, height: half, color: C.yellow })
    page.drawRectangle({ x, y, width: half, height: half, color: C.green })
    page.drawRectangle({ x, y: y + half, width: half, height: half, color: C.blue })
  } else {
    page.drawRectangle({
      x,
      y,
      width: s,
      height: s,
      color: d.border === 'solid' ? hexToRgb(d.borderColor) : face,
    })
  }
  const inset = 2.55 * (s / 98)
  page.drawRectangle({
    x: x + inset,
    y: y + inset,
    width: s - inset * 2,
    height: s - inset * 2,
    color: face,
  })
}

function drawFreeElement(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  el: CardElement,
  logo: PDFImage | null,
  url: string,
  wash: RGB,
  faceLeftPt: number,
  faceTopPt: number,
) {
  const u = mm(1)
  const left = faceLeftPt + mm(el.x)
  const top = faceTopPt - mm(el.y)
  const bottom = top - mm(el.h)
  const cx = left + mm(el.w) / 2
  const cy = (top + bottom) / 2

  if (el.type === 'text') {
    // Radius pratinjau hanya aktif saat kotak berlatar warna.
    const radius = el.bg ? mm(el.bgRadius) : 0
    if (el.bg) {
      fillRound(page, left, bottom, mm(el.w), mm(el.h), radius, hexToRgb(el.bg))
    }
    if (el.border) {
      // CSS border-box: garis di dalam kotak, setengah tebalnya masuk.
      const bw = 0.3 * u
      strokeRound(
        page,
        left + bw / 2,
        bottom + bw / 2,
        mm(el.w) - bw,
        mm(el.h) - bw,
        Math.max(radius - bw / 2, 0),
        mixOver(C.ink, 0.16),
        bw,
      )
    }
    const text = el.upper ? el.text.toUpperCase() : el.text
    if (!text.trim()) return
    const font = el.bold ? fonts.bold : fonts.regular
    // Ukuran font otoring dalam mm — pdf-lib minta poin. Tidak ada
    // pengecilan otomatis: pratinjau juga tidak mengecilkan (baris yang
    // keluar dari kotak dipotong, meniru overflow hidden).
    const size = mm(el.size)
    const lineH = size * 1.18
    const lines = wrapText(font, text, size, mm(el.w))
    const totalH = lines.length * lineH
    const boxH = mm(el.h)
    const ascent = font.heightAtSize(size, { descender: false })
    const halfLead = (lineH - font.heightAtSize(size)) / 2
    lines.forEach((line, i) => {
      const lineTop = (boxH - totalH) / 2 + i * lineH
      if (lineTop + lineH <= 0 || lineTop >= boxH) return
      const w = font.widthOfTextAtSize(line, size)
      const x =
        el.align === 'left'
          ? left
          : el.align === 'right'
            ? left + mm(el.w) - w
            : cx - w / 2
      page.drawText(line, {
        x,
        y: top - lineTop - halfLead - ascent,
        size,
        font,
        color: hexToRgb(el.color),
      })
    })
  } else if (el.type === 'logo') {
    drawLogoAt(page, logo, cx, cy, Math.min(mm(el.w), mm(el.h)))
  } else if (el.type === 'qr') {
    const bg = el.bg ? hexToRgb(el.bg) : C.white
    fillRound(page, left, bottom, mm(el.w), mm(el.h), 2.05 * u, bg)
    if (el.corner === true && el.border) {
      // Bracket sudut gaya pemandu scan: dua garis L di tiap sudut dengan
      // ujung bulat, panjang ~29% sisi kotak — sama dengan CSS .qr-corners.
      const arm = Math.min(mm(el.w), mm(el.h)) * 0.29
      const bw = 0.85 * u
      const color = hexToRgb(el.borderColor)
      const x0 = left
      const x1 = left + mm(el.w)
      const y0 = bottom
      const y1 = bottom + mm(el.h)
      const strokes: [number, number, number, number][] = [
        [x0, y1, x0 + arm, y1],
        [x0, y1 - arm, x0, y1],
        [x1 - arm, y1, x1, y1],
        [x1, y1 - arm, x1, y1],
        [x0, y0, x0 + arm, y0],
        [x0, y0 + arm, x0, y0],
        [x1 - arm, y0, x1, y0],
        [x1, y0 + arm, x1, y0],
      ]
      for (const [sx, sy, ex, ey] of strokes) {
        page.drawLine({
          start: { x: sx, y: sy },
          end: { x: ex, y: ey },
          thickness: bw,
          color,
          lineCap: LineCapStyle.Round,
        })
      }
    } else if (el.border) {
      const bw = 0.4 * u
      strokeRound(
        page,
        left + bw / 2,
        bottom + bw / 2,
        mm(el.w) - bw,
        mm(el.h) - bw,
        2.05 * u - bw / 2,
        hexToRgb(el.borderColor),
        bw,
      )
    }
    // Pratinjau: SVG QR 84% dari kotak, berpusat.
    const inner = Math.min(mm(el.w), mm(el.h)) * 0.84
    drawQr(page, url, cx - inner / 2, cy - inner / 2, inner)
  } else if (el.type === 'nfc') {
    if (el.bg) {
      fillRound(page, left, bottom, mm(el.w), mm(el.h), mm(el.bgRadius), hexToRgb(el.bg))
    }
    // Pratinjau: SVG mengisi 100% kotak (hand 92%) dengan viewBox 64 dan
    // strokeWidth 3.1 — tiru persis agar tebal garisnya sama.
    const box = Math.min(mm(el.w), mm(el.h))
    const iconSize = el.icon === 'hand' ? box * 0.92 : box
    drawNfcIcon(page, el.icon, cx, cy, iconSize, hexToRgb(el.color), (3.1 / 64) * iconSize)
  } else if (el.type === 'stars') {
    const star = Math.min(mm(el.h), mm(el.w) / 5.8)
    const gap = Math.max(0, (mm(el.w) - 5 * star) / 4)
    const total = 5 * star + 4 * gap
    // drawSvgPath anchors at the star box BOTTOM (path y is flipped).
    const starBottom = cy + star / 2
    let starX = cx - total / 2
    for (let i = 0; i < 5; i++) {
      page.drawSvgPath(STAR, {
        x: starX,
        y: starBottom,
        scale: star / 24,
        color: hexToRgb(el.color),
      })
      starX += star + gap
    }
  } else if (el.type === 'divider') {
    // Pratinjau mengisi seluruh kotak elemen dengan warna garis.
    page.drawRectangle({
      x: left,
      y: bottom,
      width: mm(el.w),
      height: mm(el.h),
      color: hexToRgb(el.color),
    })
    if (el.label.trim()) {
      // Pil label: padding 0.9cqi 1.8cqi + font 2.2cqi (line-height 1) pada
      // pratinjau, label tampil apa adanya. Lingkaran wash tanpa garis tepi,
      // sama seperti CSS .free-el-divider-label.
      const size = 2.2 * u
      const labelW = fonts.bold.widthOfTextAtSize(el.label, size)
      const pillH = 4.6 * u
      const pillW = labelW + 4.2 * u
      fillRound(page, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2, wash)
      centerText(page, fonts.bold, el.label, cx, cy - size / 3, size, hexToRgb(el.labelColor))
    }
  }
}

function drawFreeCard(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  originX: number,
  originY: number,
  url: string,
  design: CardDesign,
  logo: PDFImage | null,
) {
  const s = mm(98)
  const face = hexToRgb(design.faceColor)
  const wash = hexToRgb(design.washColor)
  drawFrame(page, design, originX, originY, s, face)
  const inset = 2.55 * (s / 98)
  const faceLeftPt = originX + inset
  const faceTopPt = originY + s - inset
  for (const el of design.elements ?? []) {
    drawFreeElement(page, fonts, el, logo, url, wash, faceLeftPt, faceTopPt)
  }
}

function drawCard(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  originX: number,
  originY: number,
  url: string,
  design: CardDesign,
  logo: PDFImage | null,
) {
  const s = mm(CARD)
  const u = s / 100
  const x = originX
  const y = originY
  const half = s / 2
  const d = design

  const face = hexToRgb(d.faceColor)
  const ink = hexToRgb(d.inkColor)
  const muted = hexToRgb(d.mutedColor)
  const wash = hexToRgb(d.washColor)
  const ctaBg = hexToRgb(d.ctaColor)
  const ctaInk = hexToRgb(d.ctaTextColor)
  // Keep the three distinct grey tiers of the original design until the
  // muted color is customized, so the shipped look stays pixel-identical.
  const mutedTiers = d.mutedColor === DEFAULT_CARD_DESIGN.mutedColor
  const textWidth = s - 2 * (2.55 * u + 5.4 * u)
  const inkLine = mixOver(ink, 0.16)

  if (d.border === 'google') {
    // Sama seperti drawFrame: ikuti urutan conic-gradient pratinjau.
    page.drawRectangle({ x: x + half, y: y + half, width: half, height: half, color: C.red })
    page.drawRectangle({
      x: x + half,
      y,
      width: half,
      height: half,
      color: C.yellow,
    })
    page.drawRectangle({ x, y, width: half, height: half, color: C.green })
    page.drawRectangle({ x, y: y + half, width: half, height: half, color: C.blue })
  } else {
    page.drawRectangle({
      x,
      y,
      width: s,
      height: s,
      color: d.border === 'solid' ? hexToRgb(d.borderColor) : face,
    })
  }

  const inset = 2.55 * u
  page.drawRectangle({
    x: x + inset,
    y: y + inset,
    width: s - inset * 2,
    height: s - inset * 2,
    color: face,
  })

  const cx = x + s / 2
  const padX = 5.4 * u
  let top = y + s - inset - 4.6 * u
  const mark = 3.2 * u

  if (d.logoStyle === 'hero') {
    const heroSize = 15 * u
    drawLogoAt(page, logo, cx, top - heroSize / 2, heroSize)
    top -= heroSize + 1.2 * u
    if (d.merchantName) {
      let mSize = 2.3 * u
      while (
        mSize > 1 &&
        fonts.bold.widthOfTextAtSize(d.merchantName, mSize) > textWidth
      ) {
        mSize -= 0.1
      }
      centerText(
        page,
        fonts.bold,
        d.merchantName,
        cx,
        top - mSize,
        mSize,
        mutedTiers ? C.mute : muted,
      )
      top -= mSize + 1.2 * u
    }
  } else if (logo || d.merchantName) {
    if (!d.merchantName) {
      drawLogoAt(page, logo, cx, top - mark / 2, mark)
      top -= mark + 1.8 * u
    } else {
      let merchantSize = 2.3 * u
      while (
        merchantSize > 1 &&
        fonts.bold.widthOfTextAtSize(d.merchantName, merchantSize) >
          textWidth - mark - 0.85 * u
      ) {
        merchantSize -= 0.1
      }
      const merchantW = fonts.bold.widthOfTextAtSize(d.merchantName, merchantSize)
      const merchantX = cx - (mark + 0.85 * u + merchantW) / 2
      drawLogoAt(
        page,
        logo,
        merchantX + mark / 2,
        top - mark / 2,
        mark,
      )
      page.drawText(d.merchantName, {
        x: merchantX + mark + 0.85 * u,
        y: top - mark + (mark - merchantSize) / 2,
        size: merchantSize,
        font: fonts.bold,
        color: mutedTiers ? C.mute : muted,
      })
      top -= mark + 1.8 * u
    }
  }

  const kickerSize = 2.05 * u
  if (d.kicker) {
    fitCenterText(
      page,
      fonts.bold,
      d.kicker.toUpperCase(),
      cx,
      top - kickerSize,
      kickerSize,
      mutedTiers ? C.kicker : muted,
      textWidth,
    )
  }
  top -= kickerSize + 0.55 * u

  if (d.title) {
    const titleSize = 8.4 * u
    fitCenterText(
      page,
      fonts.bold,
      d.title,
      cx,
      top - titleSize * 0.78,
      titleSize,
      ink,
      textWidth,
    )
    top -= titleSize * 0.9 + 1.2 * u
  }

  if (d.showStars) {
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
  }

  const promptSize = 2.5 * u
  if (d.prompt) {
    fitCenterText(
      page,
      fonts.regular,
      d.prompt,
      cx,
      top - promptSize,
      promptSize,
      mutedTiers ? C.mute : muted,
      textWidth,
    )
  }
  top -= promptSize + 2 * u

  const showNfc = d.showNfc || !d.showQr
  const showQr = d.showQr
  const showOr = showNfc && showQr
  const orSize = 2.1 * u
  const orLabel = d.orLabel.toUpperCase()
  const orW = fonts.bold.widthOfTextAtSize(orLabel, orSize)
  const colGap = 2.2 * u
  const capSize = 1.9 * u
  const mutedForText = mutedTiers ? C.or : muted

  if (d.actionsLayout === 'split') {
    const glyph = 24 * u
    const qrBox = 27 * u
    const labelSize = 3 * u
    const colGapV = 1.4 * u
    const nfcColH =
      glyph + colGapV + labelSize + (d.nfcCaption ? colGapV + capSize : 0)
    const qrColH =
      qrBox + colGapV + labelSize + (d.qrCaption ? colGapV + capSize : 0)
    const blockH = Math.max(nfcColH, qrColH, glyph)
    const centerY = top - blockH / 2
    const contentLeft = x + inset + padX
    const contentW = s - 2 * (inset + padX)
    const leftCx = showQr && showNfc ? contentLeft + contentW / 4 : cx
    const rightCx = showQr && showNfc ? contentLeft + (contentW * 3) / 4 : cx

    if (showNfc) {
      const colTop = centerY + nfcColH / 2
      drawNfcIcon(
        page,
        d.nfcIcon,
        leftCx,
        colTop - glyph / 2,
        d.nfcIcon === 'hand' ? glyph : glyph * 1.35,
        ink,
        1.1 * u,
      )
      const labelY = colTop - glyph - colGapV - labelSize
      if (d.nfcLabel) {
        fitCenterText(
          page,
          fonts.bold,
          d.nfcLabel,
          leftCx,
          labelY,
          labelSize,
          ink,
          contentW / 2,
        )
      }
      if (d.nfcCaption) {
        fitCenterText(
          page,
          fonts.regular,
          d.nfcCaption,
          leftCx,
          labelY - colGapV - capSize,
          capSize,
          mutedTiers ? C.mute : muted,
          contentW / 2,
        )
      }
    }

    if (showQr) {
      const colTop = centerY + qrColH / 2
      const qrY = colTop - qrBox
      const qrBorder = 0.4 * u
      const qrPad = 1.7 * u
      fillRound(page, rightCx - qrBox / 2, qrY, qrBox, qrBox, 2.4 * u, C.white)
      strokeRound(
        page,
        rightCx - qrBox / 2,
        qrY,
        qrBox,
        qrBox,
        2.4 * u,
        inkLine,
        qrBorder,
      )
      drawQr(page, url, rightCx - qrBox / 2 + qrPad + qrBorder, qrY + qrPad + qrBorder, qrBox - (qrPad + qrBorder) * 2)
      const labelY = qrY - colGapV - labelSize
      if (d.qrLabel) {
        fitCenterText(
          page,
          fonts.bold,
          d.qrLabel,
          rightCx,
          labelY,
          labelSize,
          ink,
          contentW / 2,
        )
      }
      if (d.qrCaption) {
        fitCenterText(
          page,
          fonts.regular,
          d.qrCaption,
          rightCx,
          labelY - colGapV - capSize,
          capSize,
          mutedTiers ? C.mute : muted,
          contentW / 2,
        )
      }
    }

    if (showOr) {
      const divHalf = blockH / 2 - 1.5 * u
      page.drawRectangle({
        x: cx - 0.175 * u,
        y: centerY - divHalf,
        width: 0.35 * u,
        height: divHalf * 2,
        color: inkLine,
      })
      if (orLabel) {
        const pillW = orW + 5 * u
        const pillH = 5 * u
        fillRound(page, cx - pillW / 2, centerY - pillH / 2, pillW, pillH, pillH / 2, face)
        strokeRound(page, cx - pillW / 2, centerY - pillH / 2, pillW, pillH, pillH / 2, inkLine, 0.3 * u)
        centerText(page, fonts.bold, orLabel, cx, centerY - orSize / 3, orSize, mutedForText)
      }
    }

    top -= blockH + 2 * u
  } else {
    const box = 32 * u
    const actionsW = showOr
      ? box + colGap + orW + colGap + box
      : box
    const actionsX = cx - actionsW / 2
    const boxY = top - box
    const nfcX = showOr || !showQr ? actionsX : actionsX + box + colGap + orW + colGap
    const qrX = showOr ? actionsX + box + colGap + orW + colGap : actionsX

    if (showNfc) {
      fillRound(page, nfcX, boxY, box, box, 4 * u, wash)
      drawNfcIcon(
        page,
        d.nfcIcon,
        nfcX + box / 2,
        boxY + box / 2,
        d.nfcIcon === 'hand' ? box * 0.85 : box,
        ink,
        1.15 * u,
      )
    }
    if (showQr) {
      fillRound(page, qrX, boxY, box, box, 4 * u, wash)
      const qrPad = 2.4 * u
      page.drawRectangle({
        x: qrX + qrPad,
        y: boxY + qrPad,
        width: box - qrPad * 2,
        height: box - qrPad * 2,
        color: C.white,
      })
      drawQr(page, url, qrX + qrPad, boxY + qrPad, box - qrPad * 2)
    }

    if (showOr && orLabel) {
      centerText(
        page,
        fonts.bold,
        orLabel,
        actionsX + box + colGap + orW / 2,
        boxY + box / 2 - orSize / 3,
        orSize,
        mutedForText,
      )
    }

    const labelSize = 2.8 * u
    const labelY = boxY - 1.5 * u - labelSize
    if (showNfc && d.nfcLabel) {
      fitCenterText(page, fonts.bold, d.nfcLabel, nfcX + box / 2, labelY, labelSize, ink, box + 4 * u)
    }
    if (showQr && d.qrLabel) {
      fitCenterText(page, fonts.bold, d.qrLabel, qrX + box / 2, labelY, labelSize, ink, box + 4 * u)
    }
    if (showNfc && d.nfcCaption) {
      fitCenterText(page, fonts.regular, d.nfcCaption, nfcX + box / 2, labelY - 0.9 * u - capSize, capSize, mutedTiers ? C.mute : muted, box + 4 * u)
    }
    if (showQr && d.qrCaption) {
      fitCenterText(page, fonts.regular, d.qrCaption, qrX + box / 2, labelY - 0.9 * u - capSize, capSize, mutedTiers ? C.mute : muted, box + 4 * u)
    }
  }

  const ctaH = 6.7 * u
  const ctaY = y + inset + 4 * u
  if (d.footer === 'cta' && d.cta) {
    fillRound(page, x + padX, ctaY, s - padX * 2, ctaH, 2 * u, ctaBg)
    const ctaSize = 2.5 * u
    fitCenterText(
      page,
      fonts.bold,
      d.cta,
      cx,
      ctaY + (ctaH - ctaSize) / 2,
      ctaSize,
      ctaInk,
      s - padX * 2,
    )
  } else if (d.footer === 'pill' && d.cta) {
    const pillH = 6.5 * u
    const mini = 3 * u
    const miniGap = 1.4 * u
    const pillPadX = 3 * u
    const pillSize = 2.2 * u
    let textSize = pillSize
    while (textSize > 1 && fonts.bold.widthOfTextAtSize(d.cta, textSize) > s - padX * 2 - pillPadX * 2 - mini - miniGap) {
      textSize -= 0.1
    }
    const textW = fonts.bold.widthOfTextAtSize(d.cta, textSize)
    const pillW = Math.min(mini + miniGap + textW + pillPadX * 2, s - padX * 2)
    const pillX = cx - pillW / 2
    fillRound(page, pillX, ctaY, pillW, pillH, pillH / 2, wash)
    strokeRound(page, pillX, ctaY, pillW, pillH, pillH / 2, inkLine, 0.3 * u)
    drawLogoAt(page, logo, pillX + pillPadX + mini / 2, ctaY + pillH / 2, mini)
    page.drawText(d.cta, {
      x: pillX + pillPadX + mini + miniGap,
      y: ctaY + (pillH - textSize) / 2,
      size: textSize,
      font: fonts.bold,
      color: mutedTiers ? C.kicker : muted,
    })
  }
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
  design?: CardDesign
  onProgress?: (done: number, total: number) => void
}) {
  const design = input.design ?? defaultCardDesign()
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  let logo: PDFImage | null = null
  if (design.logo) {
    try {
      const bytes = dataUrlBytes(design.logo)
      logo = design.logo.startsWith('data:image/png')
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes)
    } catch {
      logo = null
    }
  }
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
      if (isFreeDesign(design)) {
        drawFreeCard(page, fonts, slot.x, slot.y, card.redirectUrl, design, logo)
      } else {
        drawCard(page, fonts, slot.x, slot.y, card.redirectUrl, design, logo)
      }
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
