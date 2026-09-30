import { z } from 'zod'

export type ViewKey = 'stock' | 'units'
export type ViewDensity = 'compact' | 'normal'
export type StockViewMode = 'list' | 'table'

export type ViewPrefs = {
  columns?: string[]
  density?: ViewDensity
  mode?: StockViewMode
}

const UNITS_COLUMN_KEYS = [
  'code',
  'outlet',
  'batch',
  'partner',
  'holder',
  'nfc',
  'status',
  'activatedAt',
] as const

const STOCK_COLUMN_KEYS = [
  'label',
  'date',
  'remaining',
  'available',
  'nfcWritten',
  'pendingActivation',
  'active',
  'inactive',
] as const

export const VIEW_COLUMN_KEYS: Record<ViewKey, readonly string[]> = {
  units: UNITS_COLUMN_KEYS,
  stock: STOCK_COLUMN_KEYS,
}

export const DEFAULT_VIEW_PREFS: Record<ViewKey, Required<ViewPrefs>> = {
  units: {
    columns: [
      'code',
      'outlet',
      'batch',
      'holder',
      'nfc',
      'status',
      'activatedAt',
    ],
    density: 'normal',
    mode: 'list',
  },
  stock: {
    columns: [
      'label',
      'date',
      'remaining',
      'available',
      'nfcWritten',
      'pendingActivation',
    ],
    density: 'normal',
    mode: 'list',
  },
}

const prefsShape = z.object({
  columns: z.array(z.string().max(40)).max(32).optional(),
  density: z.enum(['compact', 'normal']).optional(),
  mode: z.enum(['list', 'table']).optional(),
})

/**
 * Safely parse stored prefs: unknown keys dropped, column order follows the
 * canonical order, and anything invalid falls back to the view defaults.
 */
export function normalizeViewPrefs(
  view: ViewKey,
  raw: unknown,
): Required<ViewPrefs> {
  const fallback = DEFAULT_VIEW_PREFS[view]
  const parsed = prefsShape.safeParse(raw)
  if (!parsed.success) return { ...fallback, columns: [...fallback.columns] }

  const known = VIEW_COLUMN_KEYS[view]
  const selected = new Set(parsed.data.columns ?? [])
  const columns = known.filter((key) => selected.has(key))
  return {
    columns: columns.length > 0 ? columns : [...fallback.columns],
    density: parsed.data.density ?? fallback.density,
    mode: parsed.data.mode ?? fallback.mode,
  }
}

export function parseStoredViewPrefs(
  view: ViewKey,
  stored: string | null,
): Required<ViewPrefs> {
  if (!stored) return { ...DEFAULT_VIEW_PREFS[view], columns: [...DEFAULT_VIEW_PREFS[view].columns] }
  try {
    return normalizeViewPrefs(view, JSON.parse(stored))
  } catch {
    return { ...DEFAULT_VIEW_PREFS[view], columns: [...DEFAULT_VIEW_PREFS[view].columns] }
  }
}
