import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/**
 * UTC calendar day (YYYY-MM-DD) from a timestamp_ms column.
 * SQLite now; swap to `to_char(date_trunc('day', col AT TIME ZONE 'UTC'), 'YYYY-MM-DD')` for Postgres.
 */
export function sqlDayBucket(column: SQLWrapper): SQL<string> {
  return sql<string>`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch')`
}
