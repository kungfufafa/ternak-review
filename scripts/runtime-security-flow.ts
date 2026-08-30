import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(path.join(os.tmpdir(), 'review-runtime-'))

async function reservePort() {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  if (!port) throw new Error('Gagal memilih port runtime test')
  return port
}

function startServer(port: number, googleKey: string) {
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DEPLOY_TARGET: 'node',
      PORT: String(port),
      DATABASE_URL: `file:${path.join(temp, `runtime-${port}.db`)}`,
      APP_URL: 'https://review.example',
      AUTH_SECRET: 'runtime-auth-secret-0000000000000001',
      IP_HASH_SALT: 'runtime-ip-hash-salt-00000000000002',
      ADMIN_SETUP_TOKEN: 'runtime-admin-setup-token-0000000003',
      GOOGLE_MAPS_API_KEY: googleKey,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return child
}

async function waitForServer(child: ChildProcess, url: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server runtime berhenti dengan exit ${child.exitCode}`)
    }
    try {
      return await fetch(url)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error('Server runtime tidak siap dalam 10 detik')
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function assertSecurityHeaders(response: Response) {
  for (const name of [
    'content-security-policy',
    'permissions-policy',
    'referrer-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
  ]) {
    if (!response.headers.get(name)) {
      throw new Error(`Header keamanan ${name} tidak ada`)
    }
  }

  const csp = response.headers.get('content-security-policy') ?? ''
  for (const directive of [
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src 'self' https://www.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  ]) {
    if (!csp.includes(directive)) {
      throw new Error(`CSP production tidak memuat: ${directive}`)
    }
  }
}

async function runValidConfig() {
  const port = await reservePort()
  const child = startServer(port, 'runtime-google-key')
  const base = `http://127.0.0.1:${port}`
  try {
    const health = await waitForServer(child, `${base}/health`)
    if (health.status !== 200) throw new Error('Health valid wajib 200')
    assertSecurityHeaders(health)
    if (health.headers.get('cache-control') !== 'no-store') {
      throw new Error('Health wajib no-store')
    }

    const redirect = await fetch(`${base}/r/DOESNOTEXIST`, {
      redirect: 'manual',
    })
    if (redirect.status !== 302) throw new Error('Redirect kartu wajib 302')
    assertSecurityHeaders(redirect)
    if (redirect.headers.get('cache-control') !== 'no-store') {
      throw new Error('Redirect kartu wajib no-store')
    }
  } finally {
    await stopServer(child)
  }
}

async function runInvalidConfig() {
  const port = await reservePort()
  const child = startServer(port, '')
  const base = `http://127.0.0.1:${port}`
  try {
    const health = await waitForServer(child, `${base}/health`)
    if (health.status !== 503) throw new Error('Health invalid wajib 503')
    assertSecurityHeaders(health)

    const app = await fetch(`${base}/login`)
    if (app.status !== 503) {
      throw new Error('Aplikasi dengan config invalid wajib fail-closed 503')
    }
    assertSecurityHeaders(app)
  } finally {
    await stopServer(child)
  }
}

try {
  await runValidConfig()
  await runInvalidConfig()
  console.log('runtime security flow passed')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
