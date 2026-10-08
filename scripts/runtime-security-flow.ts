import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(path.join(os.tmpdir(), 'review-runtime-'))
const serverOutput = new WeakMap<ChildProcess, string[]>()

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

function startServer(port: number, overrides: Record<string, string> = {}) {
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
      GOOGLE_MAPS_API_KEY: 'runtime-google-key',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Drain both pipes so a chatty server never blocks, and keep the tail for
  // the failure report.
  const lines: string[] = []
  const keep = (chunk: Buffer) => {
    lines.push(chunk.toString())
    if (lines.length > 200) lines.shift()
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  serverOutput.set(child, lines)
  return child
}

function printServerOutput(child: ChildProcess) {
  const output = serverOutput.get(child)?.join('').trim()
  console.error(
    output ? `--- output server runtime ---\n${output}` : '--- server runtime tidak mencetak apa pun ---',
  )
}

async function expectStatus(response: Response, status: number, label: string) {
  if (response.status === status) return
  const body = (await response.text()).slice(0, 2000)
  throw new Error(`${label} wajib ${status}, dapat ${response.status}: ${body}`)
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
  const child = startServer(port)
  const base = `http://127.0.0.1:${port}`
  try {
    const health = await waitForServer(child, `${base}/health`)
    await expectStatus(health, 200, 'Health valid')
    assertSecurityHeaders(health)
    if (health.headers.get('cache-control') !== 'no-store') {
      throw new Error('Health wajib no-store')
    }

    const redirect = await fetch(`${base}/r/DOESNOTEXIST`, {
      redirect: 'manual',
    })
    await expectStatus(redirect, 302, 'Redirect kartu')
    assertSecurityHeaders(redirect)
    if (redirect.headers.get('cache-control') !== 'no-store') {
      throw new Error('Redirect kartu wajib no-store')
    }
  } catch (error) {
    printServerOutput(child)
    throw error
  } finally {
    await stopServer(child)
  }
}

async function runInvalidConfig() {
  const port = await reservePort()
  const child = startServer(port, { AUTH_SECRET: 'short' })
  const base = `http://127.0.0.1:${port}`
  try {
    const health = await waitForServer(child, `${base}/health`)
    await expectStatus(health, 503, 'Health invalid')
    assertSecurityHeaders(health)

    const app = await fetch(`${base}/login`)
    await expectStatus(app, 503, 'Aplikasi dengan config invalid (fail-closed)')
    assertSecurityHeaders(app)
  } catch (error) {
    printServerOutput(child)
    throw error
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
