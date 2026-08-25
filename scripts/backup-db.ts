import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { resolveSqliteFilePath } from '../src/db/url.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(root, '.env.local') })
config({ path: path.join(root, '.env') })

const backupsDir = path.join(root, 'backups')
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
copyFileSync(file, dest)
for (const suffix of ['-wal', '-shm']) {
  const extra = `${file}${suffix}`
  if (existsSync(extra)) copyFileSync(extra, `${dest}${suffix}`)
}
console.log(`Backup SQLite → ${dest}`)
