import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/** Cloudflare D1 max bound parameters per query (also safe for default SQLite). */
export const SQL_MAX_VARIABLES = 100

/** How many items fit in one `IN` / multi-row `VALUES` list for `bindsPerItem` placeholders each. */
export function sqlVariableChunkSize(bindsPerItem = 1) {
  return Math.max(1, Math.floor(SQL_MAX_VARIABLES / Math.max(1, bindsPerItem)))
}

/** Membership test that binds one JSON array instead of one placeholder per value. */
export function inJsonEach(column: SQLWrapper, values: readonly string[]) {
  if (values.length === 0) return sql`false`
  return sql`${column} in (select value from json_each(${JSON.stringify(values)}))`
}

/** Asia/Jakarta calendar day (YYYY-MM-DD) from a timestamp_ms column. */
export function sqlDayBucket(column: SQLWrapper): SQL<string> {
  return sql<string>`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch', '+7 hours')`
}
