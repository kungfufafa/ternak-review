import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const remote = process.argv.includes('--remote')
const dbName = process.env.D1_DATABASE_NAME ?? 'ternak-review'

type Journal = {
  entries: Array<{ tag: string; idx: number }>
}

const journal = JSON.parse(
  readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'),
) as Journal

const tmp = mkdtempSync(path.join(os.tmpdir(), 'd1-migrate-'))

try {
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const file = path.join(root, 'drizzle', `${entry.tag}.sql`)
    const raw = readFileSync(file, 'utf8')
    const sql = raw
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (part.endsWith(';') ? part : `${part};`))
      .join('\n')

    const tmpFile = path.join(tmp, `${entry.tag}.sql`)
    writeFileSync(tmpFile, sql)

    const args = [
      'wrangler',
      'd1',
      'execute',
      dbName,
      '--file',
      tmpFile,
      '--yes',
    ]
    if (remote) args.push('--remote')

    console.log(`D1 migrate ${entry.tag}${remote ? ' (remote)' : ' (local)'}`)
    const result = spawnSync('npx', args, { stdio: 'inherit', cwd: root })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
  console.log('D1 migrations applied.')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
