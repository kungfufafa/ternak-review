import { useEffect, useState } from 'react'

const DURATION_MS = 60 * 60 * 1000
const STORAGE_KEY = 'ternakreview_promo_deadline'

function readDeadline(): number {
  if (typeof window === 'undefined') return Date.now() + DURATION_MS
  const stored = Number(window.localStorage.getItem(STORAGE_KEY))
  if (stored && stored > Date.now()) return stored
  const fresh = Date.now() + DURATION_MS
  window.localStorage.setItem(STORAGE_KEY, String(fresh))
  return fresh
}

function format(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function usePromoTimer(): string {
  const [label, setLabel] = useState('60:00')

  useEffect(() => {
    let deadline = readDeadline()

    function tick() {
      let remaining = deadline - Date.now()
      if (remaining <= 0) {
        deadline = readDeadline()
        remaining = deadline - Date.now()
      }
      setLabel(format(remaining))
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return label
}
