import { useServerFn } from '@tanstack/react-start'
import { SlidersHorizontalIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_VIEW_PREFS,
  type StockViewMode,
  type ViewDensity,
  type ViewKey,
  type ViewPrefs,
} from '#/lib/view-prefs'
import { saveViewPrefsFn } from '#/server/functions'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export type ViewColumnDef = { key: string; label: string }

/**
 * "Tampilan" panel: column toggles + density (+ list/table mode for stock).
 * Edits apply instantly on the client and persist per admin account with a
 * debounced save; a failed save only surfaces a hint, the view keeps working.
 */
export function ViewCustomize({
  view,
  columns,
  prefs,
  withMode = false,
  onChange,
}: {
  view: ViewKey
  columns: ViewColumnDef[]
  prefs: Required<ViewPrefs>
  withMode?: boolean
  onChange: (next: Required<ViewPrefs>) => void
}) {
  const save = useServerFn(saveViewPrefsFn)
  const [saveError, setSaveError] = useState(false)
  const savedRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (savedRef.current === null) {
      savedRef.current = JSON.stringify(prefs)
      return
    }
    const next = JSON.stringify(prefs)
    if (next === savedRef.current) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(async () => {
      try {
        const stored = await save({ data: { view, ...prefs } })
        savedRef.current = JSON.stringify(stored)
        setSaveError(false)
      } catch {
        setSaveError(true)
      }
    }, 700)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [prefs, save, view])

  function toggleColumn(key: string) {
    const active = prefs.columns.includes(key)
    const nextColumns =
      active && prefs.columns.length === 1
        ? prefs.columns
        : active
          ? prefs.columns.filter((item) => item !== key)
          : columnsInCanonicalOrder(columns, prefs.columns, key)
    onChange({ ...prefs, columns: nextColumns })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <SlidersHorizontalIcon data-icon="inline-start" />
          Tampilan
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Kolom tampil</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            checked={prefs.columns.includes(column.key)}
            key={column.key}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleColumn(column.key)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Kerapatan</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) =>
            onChange({ ...prefs, density: value as ViewDensity })
          }
          value={prefs.density}
        >
          <DropdownMenuRadioItem
            onSelect={(event) => event.preventDefault()}
            value="normal"
          >
            Nyaman
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            onSelect={(event) => event.preventDefault()}
            value="compact"
          >
            Rapat
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {withMode ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Bentuk daftar cetakan</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                onChange({ ...prefs, mode: value as StockViewMode })
              }
              value={prefs.mode}
            >
              <DropdownMenuRadioItem
                onSelect={(event) => event.preventDefault()}
                value="list"
              >
                Kartu
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                onSelect={(event) => event.preventDefault()}
                value="table"
              >
                Tabel
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            const fallback = DEFAULT_VIEW_PREFS[view]
            onChange({ ...fallback, columns: [...fallback.columns] })
          }}
        >
          Kembalikan default
        </DropdownMenuItem>
        {saveError ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-destructive">
              Gagal menyimpan — coba ubah lagi.
            </DropdownMenuLabel>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Re-insert a toggled column without disturbing the canonical order. */
function columnsInCanonicalOrder(
  definitions: ViewColumnDef[],
  current: string[],
  added: string,
) {
  return definitions
    .map((definition) => definition.key)
    .filter((key) => current.includes(key) || key === added)
}
