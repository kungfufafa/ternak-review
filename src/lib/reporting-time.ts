export const REPORTING_TIME_ZONE = 'Asia/Jakarta'

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

/** Calendar day in the reporting timezone, independent of runtime timezone. */
export function reportingDayKey(value: Date | number = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : value
  return new Date(timestamp + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

export function shiftReportingDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

/** Start of a WIB calendar day as an absolute timestamp. */
export function reportingDayStart(day: string) {
  return new Date(`${day}T00:00:00+07:00`)
}

export function reportingMonthStart(value: Date | number = Date.now()) {
  const day = reportingDayKey(value)
  return reportingDayStart(`${day.slice(0, 7)}-01`)
}
