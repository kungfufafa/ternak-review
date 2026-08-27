import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { resolveSqliteFilePath } from '../src/db/url.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
config({ path: path.join(root, '.env.local') })
config({ path: path.join(root, '.env') })

const backupsDir = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(root, 'backups')
mkdirSync(backupsDir, { recursive: true })

const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const d1 = process.argv.includes('--d1')
const remote = process.argv.includes('--remote')
const dbName = process.env.D1_DATABASE_NAME ?? 'ternak-review'

if (d1) {
  const out = path.join(backupsDir, `d1-${stamp}.sql`)
  const args = [
    'wrangler',
    'd1',
    'export',
    dbName,
    '--output',
    out,
    '--skip-confirmation',
  ]
  if (remote) args.push('--remote')
  console.log(`Export D1 ${dbName}${remote ? ' (remote)' : ' (local)'} → ${out}`)
  const result = spawnSync('npx', args, { stdio: 'inherit', cwd: root })
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log('Backup D1 selesai.')
  process.exit(0)
}

const file = resolveSqliteFilePath()
if (!existsSync(file)) {
  console.error(`SQLite tidak ditemukan: ${file}`)
  process.exit(1)
}

const dest = path.join(backupsDir, `sqlite-${stamp}.db`)
const source = new Database(file, { readonly: true, fileMustExist: true })
try {
  await source.backup(dest)
} finally {
  source.close()
}

const backup = new Database(dest, { fileMustExist: true })
try {
  backup.pragma('wal_checkpoint(TRUNCATE)')
  backup.pragma('journal_mode = DELETE')
  const integrity = backup.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') throw new Error('Integrity check backup gagal')
} finally {
  backup.close()
}
console.log(`Backup SQLite → ${dest}`)
