import { z } from 'zod'

export type CardBorderStyle = 'google' | 'solid' | 'plain'
export type CardLogoStyle = 'mark' | 'hero'
export type CardActionsLayout = 'row' | 'split'
export type CardNfcIcon = 'tap' | 'hand'
export type CardFooterStyle = 'cta' | 'pill' | 'none'

/** Side of the inner face in mm (card 98mm minus the frame inset). */
export const FACE_MM = 92.9

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Pakai warna hex 6 digit, misal #0b57d0.')

// PNG/JPEG only: pdf-lib (ekspor CorelDRAW) bisa menyematkan keduanya,
// SVG tidak — jadi logo dibatasi agar pratinjau dan PDF selalu sama.
const logoSchema = z
  .string()
  .trim()
  .max(160_000, 'File logo terlalu besar. Maksimal sekitar 110 KB.')
  .regex(
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/,
    'Logo harus PNG atau JPG (data URL base64).',
  )

const mm = z.number().min(0).max(FACE_MM)
const mmSize = z.number().min(1).max(FACE_MM)

const elementBase = {
  id: z.string().min(1).max(40),
  x: mm,
  y: mm,
  w: mmSize,
  h: mmSize,
}

export const cardElementSchema = z.discriminatedUnion('type', [
  z.object({
    ...elementBase,
    type: z.literal('text'),
    text: z.string().max(120),
    size: z.number().min(1.2).max(20),
    bold: z.boolean(),
    color: hexColorSchema,
    align: z.enum(['left', 'center', 'right']),
    upper: z.boolean(),
    bg: hexColorSchema.nullable(),
    bgRadius: z.number().min(0).max(50),
    border: z.boolean(),
  }),
  z.object({ ...elementBase, type: z.literal('logo') }),
  z.object({
    ...elementBase,
    type: z.literal('qr'),
    bg: hexColorSchema.nullable(),
    border: z.boolean(),
    borderColor: hexColorSchema,
    // Sudut bracket (pemandu scan) menggantikan kotak penuh saat aktif.
    corner: z.boolean().optional(),
  }),
  z.object({
    ...elementBase,
    type: z.literal('nfc'),
    icon: z.enum(['tap', 'hand']),
    color: hexColorSchema,
    bg: hexColorSchema.nullable(),
    bgRadius: z.number().min(0).max(50),
  }),
  z.object({
    ...elementBase,
    type: z.literal('stars'),
    color: hexColorSchema,
  }),
  z.object({
    ...elementBase,
    type: z.literal('divider'),
    color: hexColorSchema,
    label: z.string().max(10),
    labelColor: hexColorSchema,
  }),
])

export type CardElement = z.infer<typeof cardElementSchema>
export type CardElementType = CardElement['type']

export type TextElement = Extract<CardElement, { type: 'text' }>

export function makeElementId() {
  return crypto.randomUUID()
}

export const cardDesignSchema = z
  .object({
    // Warna & bingkai (dipakai renderer terstruktur maupun kanvas)
    border: z.enum(['google', 'solid', 'plain']),
    borderColor: hexColorSchema,
    faceColor: hexColorSchema,
    inkColor: hexColorSchema,
    mutedColor: hexColorSchema,
    washColor: hexColorSchema,
    ctaColor: hexColorSchema,
    ctaTextColor: hexColorSchema,
    // Logo & identitas
    logo: logoSchema.nullable(),
    logoStyle: z.enum(['mark', 'hero']),
    merchantName: z.string().trim().max(24),
    // Bagian teks (kosong = bagian disembunyikan)
    kicker: z.string().trim().max(30),
    title: z.string().trim().max(18),
    prompt: z.string().trim().max(50),
    orLabel: z.string().trim().max(8),
    nfcLabel: z.string().trim().max(14),
    qrLabel: z.string().trim().max(14),
    nfcCaption: z.string().trim().max(28),
    qrCaption: z.string().trim().max(28),
    cta: z.string().trim().max(50),
    // Tata letak terstruktur (renderer lama — dipakai desain lama)
    actionsLayout: z.enum(['row', 'split']),
    nfcIcon: z.enum(['tap', 'hand']),
    showNfc: z.boolean(),
    showQr: z.boolean(),
    showStars: z.boolean(),
    footer: z.enum(['cta', 'pill', 'none']),
    // Mode kanvas bebas
    mode: z.enum(['structured', 'free']),
    elements: z.array(cardElementSchema).max(80).optional(),
  })
  .refine((d) => d.mode !== 'free' || (d.elements?.length ?? 0) > 0, {
    message: 'Mode kanvas butuh minimal satu elemen.',
    path: ['elements'],
  })

export type CardDesign = z.infer<typeof cardDesignSchema>

export const DEFAULT_CARD_DESIGN: CardDesign = {
  border: 'google',
  borderColor: '#4285f4',
  faceColor: '#ffffff',
  inkColor: '#202124',
  mutedColor: '#5f6368',
  washColor: '#eef1f4',
  ctaColor: '#0b57d0',
  ctaTextColor: '#ffffff',
  logo: null,
  logoStyle: 'hero',
  merchantName: '',
  kicker: 'Bantu kami dengan',
  title: 'Google Review',
  prompt: '',
  orLabel: 'atau',
  nfcLabel: 'TAP NFC',
  qrLabel: 'SCAN QR',
  nfcCaption: 'Tempelkan HP di area ini',
  qrCaption: 'Pindai dengan kamera HP',
  cta: 'Powered by TernakReview',
  actionsLayout: 'split',
  nfcIcon: 'hand',
  showNfc: true,
  showQr: true,
  showStars: true,
  footer: 'pill',
  mode: 'structured',
}

/** Desain default siap render (mode kanvas) — id elemen stabil per sesi. */
let defaultDesignCache: CardDesign | null = null

export function defaultCardDesign(): CardDesign {
  if (!defaultDesignCache) {
    defaultDesignCache = {
      ...DEFAULT_CARD_DESIGN,
      mode: 'free',
      elements: elementsFromStructured(DEFAULT_CARD_DESIGN),
    }
  }
  return defaultDesignCache
}

function textEl(
  props: Partial<TextElement> & Pick<TextElement, 'x' | 'y' | 'w' | 'h' | 'text'>,
  d: CardDesign,
): TextElement {
  return {
    id: makeElementId(),
    type: 'text',
    size: 3,
    bold: false,
    color: d.inkColor,
    align: 'center',
    upper: false,
    bg: null,
    bgRadius: 0,
    border: false,
    ...props,
  }
}

function dividerEl(
  props: Partial<Extract<CardElement, { type: 'divider' }>> &
    Pick<Extract<CardElement, { type: 'divider' }>, 'x' | 'y' | 'w' | 'h'>,
  d: CardDesign,
): CardElement {
  return {
    id: makeElementId(),
    type: 'divider',
    color: '#c9cdd2',
    label: d.orLabel,
    labelColor: d.mutedColor,
    ...props,
  }
}

/**
 * Template kanvas — menghasilkan susunan elemen (koordinat mm di area face
 * 92,9mm). Warna diambil dari desain aktif supaya tema ikut.
 */
export const CARD_CANVAS_PRESETS: Record<
  string,
  { label: string; description: string; build: (d: CardDesign) => CardElement[] }
> = {
  klasik: {
    label: 'Klasik',
    description: 'Tata letak bawaan: logo atas, NFC & QR dua kolom.',
    build: (d) => elementsFromStructured(d),
  },
  papan: {
    label: 'Papan review',
    description: 'Gaya papan: logo besar, dua kolom + pemisah, pil footer.',
    build: (d) => [
      { id: makeElementId(), type: 'logo', x: 36.45, y: 3.4, w: 20, h: 20 },
      textEl({ x: 8, y: 25, w: 76.9, h: 4.4, text: d.kicker, size: 3.3, bold: true }, d),
      textEl({ x: 8, y: 29.6, w: 76.9, h: 11, text: d.title, size: 9.4, bold: true }, d),
      { id: makeElementId(), type: 'stars', x: 30.45, y: 41.2, w: 32, h: 4.8, color: '#fbbc04' },
      { id: makeElementId(), type: 'nfc', x: 6.5, y: 48.5, w: 26, h: 16.5, icon: 'hand', color: d.inkColor, bg: null, bgRadius: 0 },
      textEl({ x: 4.5, y: 66, w: 30, h: 4.6, text: d.nfcLabel || 'TAP NFC', size: 3.5, bold: true, upper: true }, d),
      textEl({ x: 3.45, y: 70.8, w: 32, h: 6, text: d.nfcCaption || 'Tempelkan HP di area ini', size: 2.45, color: d.mutedColor }, d),
      dividerEl({ x: 45.6, y: 49, w: 1.7, h: 20 }, d),
      { id: makeElementId(), type: 'qr', x: 60.4, y: 48.5, w: 16, h: 16, bg: null, border: true, corner: false, borderColor: '#34a853' },
      textEl({ x: 53.4, y: 66, w: 30, h: 4.6, text: d.qrLabel || 'SCAN QR', size: 3.5, bold: true, upper: true }, d),
      textEl({ x: 52.45, y: 70.8, w: 32, h: 6, text: d.qrCaption || 'Pindai dengan kamera HP', size: 2.45, color: d.mutedColor }, d),
      textEl(
        {
          x: 30.4, y: 84, w: 44, h: 6, text: d.cta === DEFAULT_CARD_DESIGN.cta ? 'Powered by TernakReview' : d.cta,
          size: 2.6, bold: true, color: d.mutedColor, bg: '#ffffff', bgRadius: 3, border: true,
        },
        d,
      ),
      { id: makeElementId(), type: 'logo', x: 32.6, y: 85.2, w: 3.6, h: 3.6 },
    ],
  },
  qrOnly: {
    label: 'Khusus QR',
    description: 'Fokus ke satu QR besar.',
    build: (d) => [
      { id: makeElementId(), type: 'logo', x: 27.5, y: 4.2, w: 3.4, h: 3.4 },
      textEl({ x: 31.9, y: 4.2, w: 36, h: 3.4, text: d.merchantName, size: 2.35, bold: true, color: d.mutedColor, align: 'left' }, d),
      textEl({ x: 8, y: 11, w: 76.9, h: 10.5, text: d.title, size: 9.2, bold: true }, d),
      { id: makeElementId(), type: 'stars', x: 30.45, y: 22.5, w: 32, h: 4.6, color: '#fbbc04' },
      { id: makeElementId(), type: 'qr', x: 26.45, y: 31, w: 40, h: 40, bg: d.washColor, border: false, corner: false, borderColor: d.borderColor },
      textEl({ x: 26.45, y: 73, w: 40, h: 4.6, text: d.qrLabel, size: 2.8, bold: true }, d),
      textEl({ x: 20.45, y: 77.8, w: 52, h: 4.4, text: d.qrCaption, size: 2.4, color: d.mutedColor }, d),
      textEl(
        { x: 2.85, y: 84.3, w: 87.2, h: 6.6, text: d.cta, size: 2.5, bold: true, color: d.ctaTextColor, bg: d.ctaColor, bgRadius: 2 },
        d,
      ),
    ],
  },
  nfcOnly: {
    label: 'Khusus NFC',
    description: 'Fokus ke tap NFC saja.',
    build: (d) => [
      { id: makeElementId(), type: 'logo', x: 27.5, y: 4.2, w: 3.4, h: 3.4 },
      textEl({ x: 31.9, y: 4.2, w: 36, h: 3.4, text: d.merchantName, size: 2.35, bold: true, color: d.mutedColor, align: 'left' }, d),
      textEl({ x: 8, y: 11, w: 76.9, h: 10.5, text: d.title, size: 9.2, bold: true }, d),
      { id: makeElementId(), type: 'stars', x: 30.45, y: 22.5, w: 32, h: 4.6, color: '#fbbc04' },
      { id: makeElementId(), type: 'nfc', x: 26.45, y: 31, w: 40, h: 40, icon: d.nfcIcon, color: d.inkColor, bg: d.washColor, bgRadius: 4 },
      textEl({ x: 26.45, y: 73, w: 40, h: 4.6, text: d.nfcLabel, size: 2.8, bold: true }, d),
      textEl({ x: 20.45, y: 77.8, w: 52, h: 4.4, text: d.nfcCaption, size: 2.4, color: d.mutedColor }, d),
      textEl(
        { x: 2.85, y: 84.3, w: 87.2, h: 6.6, text: d.cta, size: 2.5, bold: true, color: d.ctaTextColor, bg: d.ctaColor, bgRadius: 2 },
        d,
      ),
    ],
  },
}

/**
 * Template tata letak bawaan — mengubah desain terstruktur menjadi susunan
 * elemen kanvas (koordinat mm di area face 92,9mm). Warna diambil dari
 * desain aktif supaya tema ikut.
 */
export function elementsFromStructured(d: CardDesign): CardElement[] {
  const els: CardElement[] = []
  const cx = FACE_MM / 2
  const hero = d.logoStyle === 'hero'

  if (hero) {
    els.push({ id: makeElementId(), type: 'logo', x: cx - 6.4, y: 3.6, w: 12.8, h: 12.8 })
    if (d.merchantName) {
      els.push(textEl({ x: 8, y: 17.4, w: 76.9, h: 3.6, text: d.merchantName, size: 2.3, bold: true, color: d.mutedColor }, d))
    }
  } else if (d.logo || d.merchantName) {
    els.push({ id: makeElementId(), type: 'logo', x: 27.5, y: 4.2, w: 3.4, h: 3.4 })
    els.push(textEl({ x: 31.9, y: 4.2, w: 36, h: 3.4, text: d.merchantName, size: 2.35, bold: true, color: d.mutedColor, align: 'left' }, d))
  }

  let top = 10.6
  if (hero) top = d.merchantName ? 22 : 18
  if (d.kicker) {
    els.push(
      textEl(
        {
          x: 8, y: top, w: 76.9, h: 3.8, text: d.kicker,
          size: hero ? 3 : 2.05, bold: true,
          color: hero ? d.inkColor : d.mutedColor, upper: !hero,
        },
        d,
      ),
    )
    top += hero ? 4.8 : 4.6
  }
  if (d.title) {
    els.push(textEl({ x: 8, y: top, w: 76.9, h: hero ? 9.8 : 10.5, text: d.title, size: hero ? 8.8 : 9.2, bold: true }, d))
    top += hero ? 10.8 : 11.6
  }
  if (d.showStars) {
    els.push({ id: makeElementId(), type: 'stars', x: cx - 14.5, y: top + 0.2, w: 29, h: 4.4, color: '#fbbc04' })
    top += 6
  }
  if (d.prompt) {
    els.push(textEl({ x: 8, y: top + 0.2, w: 76.9, h: 4, text: d.prompt, size: 2.5, color: d.mutedColor }, d))
    top += 5.6
  }

  const both = d.showNfc && d.showQr
  const boxY = Math.max(top + 0.6, 40.4)

  if (d.showNfc || d.showQr) {
    if (d.actionsLayout === 'split') {
      const colW = 38
      const colL = 5.45
      const colR = FACE_MM - 5.45 - colW
      let boxH: number
      if (both) {
        const glyph = 15
        boxH = 15.4
        els.push(
          {
            id: makeElementId(), type: 'nfc',
            x: colL + (colW - glyph) / 2, y: boxY + (boxH - glyph) / 2,
            w: glyph, h: glyph, icon: d.nfcIcon, color: d.inkColor, bg: null, bgRadius: 0,
          },
          dividerEl({ x: cx - 0.8, y: boxY, w: 1.6, h: boxH }, d),
          {
            id: makeElementId(), type: 'qr',
            x: colR + (colW - boxH) / 2, y: boxY, w: boxH, h: boxH,
            bg: null, border: true, corner: true, borderColor: '#34a853',
          },
        )
      } else if (d.showNfc) {
        boxH = 18
        els.push({ id: makeElementId(), type: 'nfc', x: cx - boxH / 2, y: boxY, w: boxH, h: boxH, icon: d.nfcIcon, color: d.inkColor, bg: null, bgRadius: 0 })
      } else {
        boxH = 20
        els.push({ id: makeElementId(), type: 'qr', x: cx - boxH / 2, y: boxY, w: boxH, h: boxH, bg: null, border: true, corner: true, borderColor: '#34a853' })
      }
      const labelY = boxY + boxH + 1.7
      const colX = both ? { nfc: colL, qr: colR } : { nfc: cx - 30, qr: cx - 30 }
      const colBoxW = both ? colW : 60
      const labelSize = both ? 2.9 : 3.2
      if (d.showNfc) {
        els.push(textEl({ x: colX.nfc, y: labelY, w: colBoxW, h: 3.6, text: d.nfcLabel, size: labelSize, bold: true }, d))
        if (d.nfcCaption) {
          els.push(textEl({ x: colX.nfc - 1, y: labelY + 4, w: colBoxW + 2, h: 3.4, text: d.nfcCaption, size: 2.15, color: d.mutedColor }, d))
        }
      }
      if (d.showQr) {
        els.push(textEl({ x: colX.qr, y: labelY, w: colBoxW, h: 3.6, text: d.qrLabel, size: labelSize, bold: true }, d))
        if (d.qrCaption) {
          els.push(textEl({ x: colX.qr - 1, y: labelY + 4, w: colBoxW + 2, h: 3.4, text: d.qrCaption, size: 2.15, color: d.mutedColor }, d))
        }
      }
    } else {
      const boxW = both ? 35.2 : 60
      const singleX = cx - boxW / 2
      const leftX = both ? 8.2 : singleX
      const rightX = both ? 49.5 : singleX
      const labelY = boxY + 35.2 + 1.5
      if (d.showNfc) {
        els.push({ id: makeElementId(), type: 'nfc', x: leftX, y: boxY, w: boxW, h: 35.2, icon: d.nfcIcon, color: d.inkColor, bg: d.washColor, bgRadius: 3.9 })
        els.push(textEl({ x: leftX, y: labelY, w: boxW, h: 4.4, text: d.nfcLabel, size: both ? 2.8 : 3.4, bold: true }, d))
        if (d.nfcCaption) {
          els.push(textEl({ x: leftX - 1, y: labelY + 4.8, w: boxW + 2, h: 6, text: d.nfcCaption, size: 2.45, color: d.mutedColor }, d))
        }
      }
      if (both) {
        els.push(textEl({ x: cx - 3.55, y: boxY + 15.9, w: 7.1, h: 3.4, text: d.orLabel, size: 2.1, bold: true, color: d.mutedColor, upper: true }, d))
      }
      if (d.showQr) {
        els.push({ id: makeElementId(), type: 'qr', x: rightX, y: boxY, w: boxW, h: 35.2, bg: d.washColor, border: false, borderColor: d.borderColor })
        els.push(textEl({ x: rightX, y: labelY, w: boxW, h: 4.4, text: d.qrLabel, size: both ? 2.8 : 3.4, bold: true }, d))
        if (d.qrCaption) {
          els.push(textEl({ x: rightX - 1, y: labelY + 4.8, w: boxW + 2, h: 6, text: d.qrCaption, size: 2.45, color: d.mutedColor }, d))
        }
      }
    }
  }

  if (d.footer === 'cta' && d.cta) {
    els.push(textEl({ x: 2.85, y: 84.3, w: 87.2, h: 6.6, text: d.cta, size: 2.5, bold: true, color: d.ctaTextColor, bg: d.ctaColor, bgRadius: 2 }, d))
  } else if (d.footer === 'pill' && d.cta) {
    els.push(textEl({ x: 24.45, y: 84, w: 44, h: 6, text: d.cta, size: 2.6, bold: true, color: d.mutedColor, bg: '#ffffff', bgRadius: 3, border: true }, d))
    els.push({ id: makeElementId(), type: 'logo', x: 26.6, y: 85.2, w: 3.6, h: 3.6 })
  }

  return els
}

/** Row value from DB may be partial or from an older shape — never throw. */
export function normalizeCardDesign(value: unknown): CardDesign {
  if (!value || typeof value !== 'object') return defaultCardDesign()
  const merged = {
    ...DEFAULT_CARD_DESIGN,
    ...(value as Record<string, unknown>),
  }
  if (!merged.showNfc && !merged.showQr) {
    merged.showQr = true
  }
  const parsed = cardDesignSchema.safeParse(merged)
  if (parsed.success) return parsed.data
  // Broken elements or unknown shape: fall back to the structured renderer.
  const { mode: _mode, elements: _elements, ...structured } = merged
  const fallback = cardDesignSchema.safeParse({
    ...structured,
    mode: 'structured',
  })
  return fallback.success ? fallback.data : defaultCardDesign()
}

const CARD_CSS_VARS = {
  faceColor: '--card-face',
  inkColor: '--card-ink',
  mutedColor: '--card-muted',
  washColor: '--card-wash',
  ctaColor: '--card-cta',
  ctaTextColor: '--card-cta-ink',
} as const

export function cardDesignCssVars(
  design: CardDesign,
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, cssVar] of Object.entries(CARD_CSS_VARS)) {
    vars[cssVar] = design[key as keyof typeof CARD_CSS_VARS]
  }
  // Until the muted color is customized, each grey text keeps its own
  // default shade via the CSS fallbacks (merchant/kicker/prompt/or).
  if (design.mutedColor === DEFAULT_CARD_DESIGN.mutedColor) {
    delete vars['--card-muted']
  }
  // 'google' keeps the conic-gradient fallback baked into the stylesheet.
  if (design.border !== 'google') {
    vars['--card-frame'] =
      design.border === 'solid' ? design.borderColor : design.faceColor
  }
  return vars
}

/**
 * Ganti satu warna tema ke warna baru di seluruh desain — termasuk elemen
 * kanvas yang masih memakai warna lama, supaya ganti tema langsung terlihat.
 */
export function recolorCardDesign(
  design: CardDesign,
  from: string,
  to: string,
): CardDesign {
  const swap = (c: string) => (c.toLowerCase() === from.toLowerCase() ? to : c)
  const swapNull = (c: string | null) => (c === null ? null : swap(c))
  return {
    ...design,
    borderColor: swap(design.borderColor),
    inkColor: swap(design.inkColor),
    mutedColor: swap(design.mutedColor),
    washColor: swap(design.washColor),
    ctaColor: swap(design.ctaColor),
    ctaTextColor: swap(design.ctaTextColor),
    elements: design.elements?.map((el): CardElement => {
      switch (el.type) {
        case 'text':
          return { ...el, color: swap(el.color), bg: swapNull(el.bg) }
        case 'nfc':
          return { ...el, color: swap(el.color), bg: swapNull(el.bg) }
        case 'qr':
          return { ...el, borderColor: swap(el.borderColor) }
        case 'stars':
          return { ...el, color: swap(el.color) }
        case 'divider':
          return { ...el, color: swap(el.color), labelColor: swap(el.labelColor) }
        default:
          return el
      }
    }),
  }
}

export function isFreeDesign(design: CardDesign): boolean {
  return design.mode === 'free' && (design.elements?.length ?? 0) > 0
}
