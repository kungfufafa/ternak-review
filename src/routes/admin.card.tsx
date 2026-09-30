import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import { PageHeader } from '#/components/page'
import { FreeCard } from '#/components/free-card'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '#/components/ui/toggle-group'
import {
  CARD_CANVAS_PRESETS,
  cardDesignSchema,
  defaultCardDesign,
  elementsFromStructured,
  FACE_MM,
  isFreeDesign,
  makeElementId,
  recolorCardDesign,
  type CardDesign,
  type CardElement,
  type CardElementType,
} from '#/lib/card-design'
import { cardQrSvg } from '#/lib/qr'
import { getCardDesignFn, saveCardDesignFn } from '#/server/functions'

export const Route = createFileRoute('/admin/card')({
  loader: () => getCardDesignFn(),
  component: CardDesignPage,
  head: () => ({
    meta: [{ title: 'Desain kartu — Ternak Review' }],
  }),
})

const LOGO_MAX_BYTES = 110_000
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

const round1 = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max)

function snapValue(value: number, targets: number[]) {
  for (const target of targets) {
    if (Math.abs(value - target) < 1) return target
  }
  return value
}

const ELEMENT_TYPE_LABEL: Record<CardElementType, string> = {
  text: 'Teks',
  logo: 'Logo',
  qr: 'QR',
  nfc: 'NFC',
  stars: 'Bintang',
  divider: 'Pemisah',
}

function elementChipLabel(el: CardElement): string {
  if (el.type === 'text') {
    const text = el.text.trim()
    return text === '' ? 'Teks (kosong)' : text
  }
  if (el.type === 'divider' && el.label.trim() !== '') return el.label.trim()
  return ELEMENT_TYPE_LABEL[el.type]
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const valid = HEX_PATTERN.test(text)
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
          onChange={(event) => {
            const hex = event.target.value
            setText(hex)
            onChange(hex)
          }}
          type="color"
          value={valid ? text : value}
        />
        <Input
          maxLength={7}
          onChange={(event) => {
            const hex = event.target.value
            setText(hex)
            if (HEX_PATTERN.test(hex)) onChange(hex)
          }}
          value={text}
        />
      </div>
    </Field>
  )
}

function NumberRow({
  label,
  value,
  min,
  max,
  step = 0.1,
  title,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  title?: string
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  const focusedRef = useRef(false)
  useEffect(() => {
    if (!focusedRef.current) setText(String(value))
  }, [value])

  function commit() {
    const n = Number(text.trim().replace(',', '.'))
    if (text.trim() === '' || Number.isNaN(n)) {
      setText(String(value))
      return
    }
    const next = round1(clamp(n, min, max))
    setText(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <Field>
      <FieldLabel title={title}>{label}</FieldLabel>
      <Input
        inputMode="decimal"
        onBlur={() => {
          focusedRef.current = false
          commit()
        }}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          focusedRef.current = true
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const next = round1(clamp(value + step, min, max))
            setText(String(next))
            onChange(next)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            const next = round1(clamp(value - step, min, max))
            setText(String(next))
            onChange(next)
          }
        }}
        value={text}
      />
    </Field>
  )
}

function CardDesignPage() {
  const savedDesign = Route.useLoaderData()
  const saveFn = useServerFn(saveCardDesignFn)
  const router = useRouter()
  const overlayRef = useRef<HTMLDivElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [design, setDesign] = useState<CardDesign>(() =>
    isFreeDesign(savedDesign)
      ? savedDesign
      : {
          ...savedDesign,
          mode: 'free',
          elements: elementsFromStructured(savedDesign),
        },
  )
  const [qrSvg, setQrSvg] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [, setHistoryVersion] = useState(0)
  const pastRef = useRef<CardDesign[]>([])
  const futureRef = useRef<CardDesign[]>([])
  const lastPushRef = useRef<{ at: number; label: string } | null>(null)
  const dragPausedRef = useRef(false)
  const designRef = useRef(design)
  designRef.current = design
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  function pushHistory(label = 'elemen') {
    if (dragPausedRef.current) return
    const now = Date.now()
    const last = lastPushRef.current
    if (last && last.label === label && now - last.at < 700) {
      last.at = now
      return
    }
    lastPushRef.current = { at: now, label }
    pastRef.current = [...pastRef.current.slice(-59), designRef.current]
    futureRef.current = []
    setHistoryVersion((v) => v + 1)
  }

  function undo() {
    const past = pastRef.current
    if (past.length === 0) return
    const prev = past[past.length - 1]
    pastRef.current = past.slice(0, -1)
    futureRef.current = [designRef.current, ...futureRef.current].slice(0, 60)
    lastPushRef.current = null
    designRef.current = prev
    setDesign(prev)
    setSelectedId((id) => (prev.elements?.some((e) => e.id === id) ? id : null))
    setSaved(false)
    setHistoryVersion((v) => v + 1)
  }

  function redo() {
    const future = futureRef.current
    if (future.length === 0) return
    const [next, ...rest] = future
    futureRef.current = rest
    pastRef.current = [...pastRef.current, designRef.current]
    lastPushRef.current = null
    designRef.current = next
    setDesign(next)
    setSelectedId((id) => (next.elements?.some((e) => e.id === id) ? id : null))
    setSaved(false)
    setHistoryVersion((v) => v + 1)
  }

  const canUndo = pastRef.current.length > 0
  const canRedo = futureRef.current.length > 0

  useEffect(() => {
    let cancelled = false
    void cardQrSvg(`${window.location.origin}/r/PREVIEW`).then((svg) => {
      if (!cancelled) setQrSvg(svg)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const elements = design.elements ?? []
  const selected = elements.find((e) => e.id === selectedId) ?? null

  function updateElements(next: CardElement[]) {
    setDesign((d) => ({ ...d, mode: 'free', elements: next }))
    setSaved(false)
  }

  function patchElement(id: string, patch: Partial<CardElement>) {
    pushHistory()
    setDesign((d) => ({
      ...d,
      mode: 'free',
      elements: (d.elements ?? []).map((e) =>
        e.id === id ? ({ ...e, ...patch } as CardElement) : e,
      ),
    }))
    setSaved(false)
  }

  function nudgeSelected(dx: number, dy: number) {
    const id = selectedIdRef.current
    if (!id) return
    pushHistory('geser')
    setDesign((d) => ({
      ...d,
      mode: 'free',
      elements: (d.elements ?? []).map((e) =>
        e.id === id
          ? {
              ...e,
              x: round1(clamp(e.x + dx, 0, FACE_MM - e.w)),
              y: round1(clamp(e.y + dy, 0, FACE_MM - e.h)),
            }
          : e,
      ),
    }))
    setSaved(false)
  }

  function addElement(type: CardElementType) {
    const cx = FACE_MM / 2
    const cy = FACE_MM / 2
    let el: CardElement
    if (type === 'text') {
      el = {
        id: makeElementId(), type: 'text', x: cx - 20, y: cy - 4, w: 40, h: 8,
        text: 'Teks baru', size: 3, bold: false, color: design.inkColor,
        align: 'center', upper: false, bg: null, bgRadius: 0, border: false,
      }
    } else if (type === 'logo') {
      el = { id: makeElementId(), type: 'logo', x: cx - 6, y: cy - 6, w: 12, h: 12 }
    } else if (type === 'qr') {
      el = { id: makeElementId(), type: 'qr', x: cx - 10, y: cy - 10, w: 20, h: 20, bg: null, border: true, corner: true, borderColor: '#34a853' }
    } else if (type === 'nfc') {
      el = { id: makeElementId(), type: 'nfc', x: cx - 6, y: cy - 6, w: 12, h: 12, icon: 'hand', color: design.inkColor, bg: null, bgRadius: 0 }
    } else if (type === 'stars') {
      el = { id: makeElementId(), type: 'stars', x: cx - 12, y: cy - 2.5, w: 24, h: 5, color: '#fbbc04' }
    } else {
      el = { id: makeElementId(), type: 'divider', x: cx - 0.85, y: cy - 9, w: 1.7, h: 18, color: '#c9cdd2', label: design.orLabel, labelColor: design.mutedColor }
    }
    updateElements([...elements, el])
    setSelectedId(el.id)
  }

  function deleteElement(id: string) {
    updateElements(elements.filter((e) => e.id !== id))
    setSelectedId(null)
  }

  function duplicateElement(id: string) {
    const source = elements.find((e) => e.id === id)
    if (!source) return
    const copy = {
      ...source,
      id: makeElementId(),
      x: round1(clamp(source.x + 2, 0, FACE_MM - source.w)),
      y: round1(clamp(source.y + 2, 0, FACE_MM - source.h)),
    } as CardElement
    const index = elements.findIndex((e) => e.id === id)
    const next = [...elements]
    next.splice(index + 1, 0, copy)
    updateElements(next)
    setSelectedId(copy.id)
  }

  function moveLayer(id: string, dir: -1 | 1) {
    const index = elements.findIndex((e) => e.id === id)
    const target = index + dir
    if (index < 0 || target < 0 || target >= elements.length) return
    const next = [...elements]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    updateElements(next)
  }

  function applyPreset(key: string) {
    const preset = CARD_CANVAS_PRESETS[key]
    if (!preset) return
    pushHistory(`preset:${key}`)
    const nextElements = preset.build(design)
    setDesign((d) => ({ ...d, mode: 'free', elements: nextElements }))
    setSelectedId(null)
    setSaved(false)
  }

  function onPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    el: CardElement,
    mode: 'move' | 'resize',
  ) {
    event.preventDefault()
    event.stopPropagation()
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const scale = FACE_MM / rect.width
    const start = { px: event.clientX, py: event.clientY, x: el.x, y: el.y, w: el.w, h: el.h }
    setSelectedId(el.id)
    setDragging(true)
    pushHistory(`geser-kanvas:${el.id}:${start.x}:${start.y}:${mode}`)
    dragPausedRef.current = true
    const target = event.currentTarget
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic or already-released pointers can't be captured — the
      // move listeners below still work while the pointer stays over us.
    }

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - start.px) * scale
      const dy = (ev.clientY - start.py) * scale
      if (mode === 'move') {
        const snapX = snapValue(start.x + dx, [
          0,
          FACE_MM - start.w,
          FACE_MM / 2 - start.w / 2,
        ])
        const snapY = snapValue(start.y + dy, [
          0,
          FACE_MM - start.h,
          FACE_MM / 2 - start.h / 2,
        ])
        patchElement(el.id, {
          x: round1(clamp(snapX, 0, FACE_MM - start.w)),
          y: round1(clamp(snapY, 0, FACE_MM - start.h)),
        })
      } else {
        patchElement(el.id, {
          w: round1(clamp(start.w + dx, 2, FACE_MM - start.x)),
          h: round1(clamp(start.h + dy, 2, FACE_MM - start.y)),
        })
      }
    }
    function onUp() {
      target.removeEventListener('pointermove', onMove)
      dragPausedRef.current = false
      setDragging(false)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp, { once: true })
    target.addEventListener('pointercancel', onUp, { once: true })
  }

  function onLogoFile(file: File | undefined) {
    if (!file) return
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setLogoError('Logo harus file PNG atau JPG.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError(
        `Ukuran logo ${Math.round(file.size / 1024)} KB. Maksimal ${Math.round(LOGO_MAX_BYTES / 1024)} KB.`,
      )
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      pushHistory('logo')
      setDesign((d) => ({ ...d, logo: String(reader.result) }))
      setSaved(false)
      setLogoError(null)
    }
    reader.readAsDataURL(file)
  }

  const keyboardHandlersRef = useRef({
    undo,
    redo,
    nudgeSelected,
    deleteElement,
    duplicateElement,
  })
  keyboardHandlersRef.current = {
    undo,
    redo,
    nudgeSelected,
    deleteElement,
    duplicateElement,
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const handlers = keyboardHandlersRef.current
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) handlers.redo()
        else handlers.undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        handlers.redo()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        const id = selectedIdRef.current
        if (id) handlers.duplicateElement(id)
        return
      }
      if (mod) return
      const step = event.shiftKey ? 1 : 0.2
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          handlers.nudgeSelected(-step, 0)
          break
        case 'ArrowRight':
          event.preventDefault()
          handlers.nudgeSelected(step, 0)
          break
        case 'ArrowUp':
          event.preventDefault()
          handlers.nudgeSelected(0, -step)
          break
        case 'ArrowDown':
          event.preventDefault()
          handlers.nudgeSelected(0, step)
          break
        case 'Delete':
        case 'Backspace': {
          const id = selectedIdRef.current
          if (id) {
            event.preventDefault()
            handlers.deleteElement(id)
          }
          break
        }
        case 'Escape':
          setSelectedId(null)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const parsed = cardDesignSchema.safeParse(design)
  const canSave = parsed.success && !busy

  async function onSave() {
    if (!parsed.success) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await saveFn({ data: parsed.data })
      setDesign(next)
      await router.invalidate({ sync: true })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="Kanvas bebas: geser, ubah ukuran, dan atur tiap elemen dalam milimeter — pratinjau, cetak browser, dan PDF CorelDRAW mengikuti persis posisi ini."
        title="Desain kartu"
      />

      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? (
        <Alert variant="success">
          Desain kartu disimpan. Cetak berikutnya sudah pakai desain baru.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(CARD_CANVAS_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              onClick={() => applyPreset(key)}
              size="sm"
              title={preset.description}
              type="button"
              variant="outline"
            >
              {preset.label}
            </Button>
          ))}
          <Button
            onClick={() => {
              pushHistory('reset')
              setDesign(defaultCardDesign())
              setSelectedId(null)
              setSaved(false)
              setLogoError(null)
              if (logoInputRef.current) logoInputRef.current.value = ''
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Pakai desain bawaan
          </Button>
          <Button
            aria-keyshortcuts="Control+Z Meta+Z"
            disabled={!canUndo}
            onClick={undo}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Undo2 aria-hidden className="size-4" /> Urungkan
          </Button>
          <Button
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            disabled={!canRedo}
            onClick={redo}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Redo2 aria-hidden className="size-4" /> Ulangi
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {busy ? <Spinner /> : null}
          <Button disabled={!canSave} onClick={() => void onSave()} type="button">
            Simpan desain
          </Button>
        </div>
      </div>
      {!parsed.success ? (
        <p className="text-sm text-destructive">
          {parsed.error.issues[0]?.message ?? 'Desain belum valid.'}
        </p>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="flex flex-col gap-4">
          <div className="mx-auto w-full max-w-md">
            <div className="canvas-stage">
              <FreeCard design={design} qrSvg={qrSvg} />
              <div
                className="canvas-overlay"
                onPointerDown={() => setSelectedId(null)}
                ref={overlayRef}
              >
                {elements.map((el) => (
                  <div
                    className="canvas-hit"
                    data-selected={el.id === selectedId}
                    key={el.id}
                    onPointerDown={(e) => onPointerDown(e, el, 'move')}
                    style={{
                      left: `${((el.x / FACE_MM) * 100).toFixed(3)}%`,
                      top: `${((el.y / FACE_MM) * 100).toFixed(3)}%`,
                      width: `${((el.w / FACE_MM) * 100).toFixed(3)}%`,
                      height: `${((el.h / FACE_MM) * 100).toFixed(3)}%`,
                      zIndex: el.id === selectedId ? 30 : undefined,
                    }}
                  >
                    {el.id === selectedId ? (
                      <span
                        className="canvas-handle"
                        onPointerDown={(e) => onPointerDown(e, el, 'resize')}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
              {dragging && selected ? (
                <div aria-hidden className="canvas-hud">
                  x {selected.x.toFixed(1)} · y {selected.y.toFixed(1)} mm —{' '}
                  {selected.w.toFixed(1)}×{selected.h.toFixed(1)} mm
                </div>
              ) : null}
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Klik elemen untuk mengatur, geser untuk memindah, tarik titik ungu
            untuk ubah ukuran. Panah keyboard menggeser halus, Ctrl+Z
            mengurungkan, Delete menghapus. QR selalu hitam-putih agar mudah
            discan.
          </p>
          {elements.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-xs text-muted-foreground">Elemen:</span>
              {elements.map((el) => (
                <button
                  className="canvas-chip"
                  data-active={el.id === selectedId}
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  title={`Pilih ${elementChipLabel(el)}`}
                  type="button"
                >
                  {elementChipLabel(el)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            {(
              [
                ['text', '+ Teks'],
                ['logo', '+ Logo'],
                ['qr', '+ QR'],
                ['nfc', '+ Ikon NFC'],
                ['stars', '+ Bintang'],
                ['divider', '+ Pemisah'],
              ] as [CardElementType, string][]
            ).map(([type, label]) => (
              <Button
                key={type}
                onClick={() => addElement(type)}
                size="sm"
                type="button"
                variant="outline"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-28">
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selected.type === 'text'
                    ? 'Teks'
                    : selected.type === 'logo'
                      ? 'Logo'
                      : selected.type === 'qr'
                        ? 'QR'
                        : selected.type === 'nfc'
                          ? 'Ikon NFC'
                          : selected.type === 'stars'
                            ? 'Bintang'
                            : 'Pemisah'}
                </CardTitle>
                <CardDescription>
                  Posisi &amp; ukuran dalam milimeter dari sudut kiri atas
                  kartu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <div className="grid grid-cols-4 gap-2">
                    <NumberRow
                      label="X" max={FACE_MM - selected.w} min={0}
                      onChange={(v) => patchElement(selected.id, { x: v })}
                      title="Posisi horizontal dari tepi kiri kartu (mm)"
                      value={selected.x}
                    />
                    <NumberRow
                      label="Y" max={FACE_MM - selected.h} min={0}
                      onChange={(v) => patchElement(selected.id, { y: v })}
                      title="Posisi vertikal dari tepi atas kartu (mm)"
                      value={selected.y}
                    />
                    <NumberRow
                      label="L" max={FACE_MM - selected.x} min={2}
                      onChange={(v) => patchElement(selected.id, { w: v })}
                      title="Lebar elemen (mm)"
                      value={selected.w}
                    />
                    <NumberRow
                      label="T" max={FACE_MM - selected.y} min={2}
                      onChange={(v) => patchElement(selected.id, { h: v })}
                      title="Tinggi elemen (mm)"
                      value={selected.h}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        patchElement(selected.id, {
                          x: round1((FACE_MM - selected.w) / 2),
                        })
                      }
                      size="sm"
                      title="Letakkan elemen di tengah secara horizontal"
                      type="button"
                      variant="outline"
                    >
                      Pusatkan H
                    </Button>
                    <Button
                      onClick={() =>
                        patchElement(selected.id, {
                          y: round1((FACE_MM - selected.h) / 2),
                        })
                      }
                      size="sm"
                      title="Letakkan elemen di tengah secara vertikal"
                      type="button"
                      variant="outline"
                    >
                      Pusatkan V
                    </Button>
                  </div>

                  {selected.type === 'text' ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="el-text">Isi teks</FieldLabel>
                        <Input
                          id="el-text"
                          maxLength={120}
                          onChange={(e) =>
                            patchElement(selected.id, { text: e.target.value })
                          }
                          value={selected.text}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <NumberRow
                          label="Ukuran font (mm)" max={20} min={1.2}
                          onChange={(v) => patchElement(selected.id, { size: v })}
                          value={selected.size}
                        />
                        <ColorRow
                          label="Warna teks"
                          onChange={(hex) => patchElement(selected.id, { color: hex })}
                          value={selected.color}
                        />
                      </div>
                      <Field>
                        <FieldLabel>Perataan</FieldLabel>
                        <ToggleGroup
                          onValueChange={(value) => {
                            if (value)
                              patchElement(selected.id, {
                                align: value as 'left' | 'center' | 'right',
                              })
                          }}
                          spacing={2}
                          type="single"
                          value={selected.align}
                          variant="outline"
                        >
                          <ToggleGroupItem value="left">Kiri</ToggleGroupItem>
                          <ToggleGroupItem value="center">Tengah</ToggleGroupItem>
                          <ToggleGroupItem value="right">Kanan</ToggleGroupItem>
                        </ToggleGroup>
                      </Field>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={selected.bold}
                            onChange={(e) =>
                              patchElement(selected.id, { bold: e.target.checked })
                            }
                            type="checkbox"
                          />
                          Tebal
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={selected.upper}
                            onChange={(e) =>
                              patchElement(selected.id, { upper: e.target.checked })
                            }
                            type="checkbox"
                          />
                          KAPITAL
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={selected.bg !== null}
                            onChange={(e) =>
                              patchElement(selected.id, {
                                bg: e.target.checked ? '#eef1f4' : null,
                              })
                            }
                            type="checkbox"
                          />
                          Latar warna
                        </label>
                        {selected.bg !== null ? (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              checked={selected.border}
                              onChange={(e) =>
                                patchElement(selected.id, { border: e.target.checked })
                              }
                              type="checkbox"
                            />
                            Garis tepi
                          </label>
                        ) : null}
                      </div>
                      {selected.bg !== null ? (
                        <div className="grid grid-cols-2 gap-3">
                          <ColorRow
                            label="Warna latar"
                            onChange={(hex) => patchElement(selected.id, { bg: hex })}
                            value={selected.bg}
                          />
                          <NumberRow
                            label="Sudut latar (mm)" max={50} min={0} step={0.5}
                            onChange={(v) => patchElement(selected.id, { bgRadius: v })}
                            value={selected.bgRadius}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {selected.type === 'nfc' ? (
                    <>
                      <Field>
                        <FieldLabel>Gaya ikon</FieldLabel>
                        <ToggleGroup
                          onValueChange={(value) => {
                            if (value)
                              patchElement(selected.id, {
                                icon: value as 'tap' | 'hand',
                              })
                          }}
                          spacing={2}
                          type="single"
                          value={selected.icon}
                          variant="outline"
                        >
                          <ToggleGroupItem value="tap">
                            HP + gelombang
                          </ToggleGroupItem>
                          <ToggleGroupItem value="hand">
                            HP di tangan
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </Field>
                      <ColorRow
                        label="Warna ikon"
                        onChange={(hex) => patchElement(selected.id, { color: hex })}
                        value={selected.color}
                      />
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={selected.bg !== null}
                            onChange={(e) =>
                              patchElement(selected.id, {
                                bg: e.target.checked ? design.washColor : null,
                              })
                            }
                            type="checkbox"
                          />
                          Kotak latar
                        </label>
                      </div>
                      {selected.bg !== null ? (
                        <div className="grid grid-cols-2 gap-3">
                          <ColorRow
                            label="Warna kotak"
                            onChange={(hex) => patchElement(selected.id, { bg: hex })}
                            value={selected.bg}
                          />
                          <NumberRow
                            label="Sudut kotak (mm)" max={50} min={0} step={0.5}
                            onChange={(v) => patchElement(selected.id, { bgRadius: v })}
                            value={selected.bgRadius}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {selected.type === 'qr' ? (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          checked={selected.bg !== null}
                          onChange={(e) =>
                            patchElement(selected.id, {
                              bg: e.target.checked ? '#ffffff' : null,
                            })
                          }
                          type="checkbox"
                        />
                        Kotak latar
                      </label>
                      <Field>
                        <FieldLabel>Bingkai QR</FieldLabel>
                        <ToggleGroup
                          onValueChange={(value) => {
                            if (!value) return
                            patchElement(selected.id, {
                              border: value !== 'none',
                              corner: value === 'corner',
                            })
                          }}
                          spacing={2}
                          type="single"
                          value={
                            !selected.border
                              ? 'none'
                              : selected.corner
                                ? 'corner'
                                : 'box'
                          }
                          variant="outline"
                        >
                          <ToggleGroupItem value="none">Tanpa</ToggleGroupItem>
                          <ToggleGroupItem value="box">
                            Kotak penuh
                          </ToggleGroupItem>
                          <ToggleGroupItem value="corner">
                            Sudut bracket
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </Field>
                      {selected.border ? (
                        <ColorRow
                          label="Warna bingkai"
                          onChange={(hex) =>
                            patchElement(selected.id, { borderColor: hex })
                          }
                          value={selected.borderColor}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {selected.type === 'stars' ? (
                    <ColorRow
                      label="Warna bintang"
                      onChange={(hex) => patchElement(selected.id, { color: hex })}
                      value={selected.color}
                    />
                  ) : null}

                  {selected.type === 'divider' ? (
                    <>
                      <Field>
                        <FieldLabel>Label di tengah garis</FieldLabel>
                        <Input
                          maxLength={10}
                          onChange={(e) =>
                            patchElement(selected.id, { label: e.target.value })
                          }
                          value={selected.label}
                        />
                        <FieldDescription>
                          Kosongkan untuk garis polos.
                        </FieldDescription>
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <ColorRow
                          label="Warna garis"
                          onChange={(hex) => patchElement(selected.id, { color: hex })}
                          value={selected.color}
                        />
                        <ColorRow
                          label="Warna label"
                          onChange={(hex) =>
                            patchElement(selected.id, { labelColor: hex })
                          }
                          value={selected.labelColor}
                        />
                      </div>
                    </>
                  ) : null}

                  {selected.type === 'logo' ? (
                    <FieldDescription>
                      Gambar logo diatur di panel “Logo toko” di bawah —
                      elemen ini hanya menempatkannya di kanvas.
                    </FieldDescription>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => duplicateElement(selected.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Duplikat
                    </Button>
                    <Button
                      onClick={() => moveLayer(selected.id, 1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Ke depan
                    </Button>
                    <Button
                      onClick={() => moveLayer(selected.id, -1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Ke belakang
                    </Button>
                    <Button
                      onClick={() => deleteElement(selected.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Hapus
                    </Button>
                  </div>
                </FieldGroup>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kartu</CardTitle>
                <CardDescription>
                  Klik elemen di kanvas untuk mengaturnya. Ini pengaturan
                  dasar kartu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel>Bingkai kartu</FieldLabel>
                    <ToggleGroup
                      className="flex-wrap"
                      onValueChange={(value) => {
                        if (!value) return
                        pushHistory('bingkai')
                        setDesign((d) => ({
                          ...d,
                          border: value as 'google' | 'solid' | 'plain',
                        }))
                        setSaved(false)
                      }}
                      spacing={2}
                      type="single"
                      value={design.border}
                      variant="outline"
                    >
                      <ToggleGroupItem value="google">
                        Google 4 warna
                      </ToggleGroupItem>
                      <ToggleGroupItem value="solid">Satu warna</ToggleGroupItem>
                      <ToggleGroupItem value="plain">Tanpa</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                  {design.border === 'solid' ? (
                    <ColorRow
                      label="Warna bingkai"
                      onChange={(hex) => {
                        pushHistory('warna-bingkai')
                        setDesign((d) => ({ ...d, borderColor: hex }))
                        setSaved(false)
                      }}
                      value={design.borderColor}
                    />
                  ) : null}
                  <ColorRow
                    label="Latar kartu"
                    onChange={(hex) => {
                      pushHistory('latar-kartu')
                      setDesign((d) => ({ ...d, faceColor: hex }))
                      setSaved(false)
                    }}
                    value={design.faceColor}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ColorRow
                      label="Warna teks utama"
                      onChange={(hex) => {
                        pushHistory('tema-ink')
                        setDesign((d) => recolorCardDesign(d, d.inkColor, hex))
                        setSaved(false)
                      }}
                      value={design.inkColor}
                    />
                    <ColorRow
                      label="Warna teks redup"
                      onChange={(hex) => {
                        pushHistory('tema-muted')
                        setDesign((d) =>
                          recolorCardDesign(d, d.mutedColor, hex),
                        )
                        setSaved(false)
                      }}
                      value={design.mutedColor}
                    />
                    <ColorRow
                      label="Warna kotak latar"
                      onChange={(hex) => {
                        pushHistory('tema-wash')
                        setDesign((d) =>
                          recolorCardDesign(d, d.washColor, hex),
                        )
                        setSaved(false)
                      }}
                      value={design.washColor}
                    />
                    <ColorRow
                      label="Warna CTA"
                      onChange={(hex) => {
                        pushHistory('tema-cta')
                        setDesign((d) => recolorCardDesign(d, d.ctaColor, hex))
                        setSaved(false)
                      }}
                      value={design.ctaColor}
                    />
                    <ColorRow
                      label="Teks CTA"
                      onChange={(hex) => {
                        pushHistory('tema-cta-ink')
                        setDesign((d) =>
                          recolorCardDesign(d, d.ctaTextColor, hex),
                        )
                        setSaved(false)
                      }}
                      value={design.ctaTextColor}
                    />
                  </div>
                  <FieldDescription>
                    Warna tema otomatis ikut mengganti elemen yang masih
                    memakai warna lamanya — praktis untuk membalik tema kartu
                    (misal latar gelap).
                  </FieldDescription>
                  <FieldDescription>
                    Semua elemen disimpan dalam milimeter — posisi di kanvas
                    = posisi di cetakan.
                  </FieldDescription>
                </FieldGroup>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo toko</CardTitle>
              <CardDescription>
                PNG/JPG maksimal 110 KB. Dipakai elemen Logo di kanvas.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                {design.logo ? (
                  <img
                    alt="Logo kartu"
                    className="h-14 w-14 rounded-lg border object-contain p-1"
                    src={design.logo}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    Default
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => logoInputRef.current?.click()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Pilih logo…
                  </Button>
                  {design.logo ? (
                    <Button
                      onClick={() => {
                        pushHistory('logo')
                        setDesign((d) => ({ ...d, logo: null }))
                        setSaved(false)
                        setLogoError(null)
                        if (logoInputRef.current) logoInputRef.current.value = ''
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Hapus
                    </Button>
                  ) : null}
                </div>
                <input
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => onLogoFile(e.target.files?.[0])}
                  ref={logoInputRef}
                  type="file"
                />
              </div>
              {logoError ? (
                <p className="text-sm text-destructive">{logoError}</p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
