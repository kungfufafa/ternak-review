import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/** Asia/Jakarta calendar day (YYYY-MM-DD) from a timestamp_ms column. */
export function sqlDayBucket(column: SQLWrapper): SQL<string> {
  return sql<string>`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch', '+7 hours')`
}
