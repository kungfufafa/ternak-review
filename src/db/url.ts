import path from 'node:path'

export const DEFAULT_SQLITE_URL = 'file:./data/dev.db'

export function getDatabaseUrl() {
  const fromProcess =
    typeof process !== 'undefined' ? process.env.DATABASE_URL?.trim() : ''
  return fromProcess || DEFAULT_SQLITE_URL
}

export function isPostgresUrl(url: string) {
  return url.startsWith('postgres://') || url.startsWith('postgresql://')
}

/** Absolute file path for the local SQLite database. */
export function resolveSqliteFilePath(url = getDatabaseUrl()) {
  if (isPostgresUrl(url)) {
    throw new Error(
      'DATABASE_URL menunjuk PostgreSQL, tapi runtime saat ini memakai SQLite. Set DATABASE_URL=file:./data/dev.db — PostgreSQL tetap dipakai di produksi nanti.',
    )
  }
  const stripped = url.replace(/^file:/i, '')
  return path.resolve(stripped)
}
