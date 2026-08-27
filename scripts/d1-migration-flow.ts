import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const persistence = mkdtempSync(path.join(os.tmpdir(), 'review-d1-'))
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler')

function applyMigrations() {
  return spawnSync(
    wrangler,
    [
      'd1',
      'migrations',
      'apply',
      'ternak-review',
      '--local',
      '--persist-to',
      persistence,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    },
  )
}

try {
  const first = applyMigrations()
  if (first.status !== 0) {
    throw new Error(first.stderr || first.stdout || 'Migrasi D1 pertama gagal')
  }

  const second = applyMigrations()
  if (second.status !== 0) {
    throw new Error(second.stderr || second.stdout || 'Migrasi D1 kedua gagal')
  }
  console.log('d1 migrations are repeat-safe')
} finally {
  rmSync(persistence, { recursive: true, force: true })
}
