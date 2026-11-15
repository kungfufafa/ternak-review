import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { REPORTING_TIME_ZONE } from './reporting-time'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function chunk<T>(items: T[], size: number) {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size))
  }
  return pages
}

/**
 * Always the WIB calendar day. Left to the runtime's own zone, the server
 * (UTC on Workers) and a browser in Indonesia print different days for
 * anything stamped between 00:00 and 07:00 WIB, and hydration fails.
 */
export function formatDay(value: Date | string | number) {
  return new Date(value).toLocaleDateString('id-ID', {
    timeZone: REPORTING_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Numeric WIB date, e.g. "15/11/2026". Same zone rule as {@link formatDay}. */
export function formatNumericDay(value: Date | string | number) {
  return new Date(value).toLocaleDateString('id-ID', {
    timeZone: REPORTING_TIME_ZONE,
  })
}

/**
 * WIB date and time, e.g. "15/11/2026, 12.00.00 WIB". The suffix is a literal
 * so server and browser cannot disagree on how the zone is abbreviated.
 */
export function formatDateTime(value: Date | string | number) {
  const text = new Date(value).toLocaleString('id-ID', {
    timeZone: REPORTING_TIME_ZONE,
  })
  return `${text} WIB`
}
