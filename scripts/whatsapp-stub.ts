/**
 * Local WhatsApp worker without Baileys or a phone.
 * Uses the same poll/report path as the real gateway so OTP, feedback, and
 * /admin/logs behave like production — messages are not sent to WhatsApp.
 */
const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const TOKEN = process.env.WHATSAPP_GATEWAY_TOKEN ?? 'local-whatsapp-gateway-token'
const WORKER_ID = process.env.WHATSAPP_GATEWAY_WORKER_ID ?? 'stub-local'

function assertLocal() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('npm run gateway:stub dilarang di production.')
  }
  let host = ''
  try {
    host = new URL(APP_URL).hostname
  } catch {
    throw new Error('APP_URL tidak valid.')
  }
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  if (!local) {
    throw new Error('npm run gateway:stub hanya ke APP_URL localhost.')
  }
}

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => null)) as {
    error?: string
    command?: { id: string; command: 'CONNECT' | 'RECONNECT' | 'LOGOUT' }
    job?: { id: string; to: string; message: string }
  } | null
  if (!response.ok) {
    throw new Error(json?.error ?? `${path} ${response.status}`)
  }
  return json
}

let gatewayStatus: 'OPEN' | 'LOGGED_OUT' = 'OPEN'

async function report(extra: Record<string, unknown> = {}) {
  await post('/api/internal/whatsapp/report', {
    workerId: WORKER_ID,
    status: gatewayStatus,
    ...extra,
  })
}

async function tick() {
  const data = await post('/api/internal/whatsapp/poll', {
    workerId: WORKER_ID,
    connected: gatewayStatus === 'OPEN',
  })
  if (data?.command) {
    gatewayStatus = data.command.command === 'LOGOUT' ? 'LOGGED_OUT' : 'OPEN'
    await report({
      command: { id: data.command.id, status: 'ACKNOWLEDGED' },
    })
    console.log(`[stub] ${data.command.command} → ${gatewayStatus}`)
  }
  if (data?.job && gatewayStatus === 'OPEN') {
    console.log(`[stub] ke ${data.job.to}`)
    console.log(data.job.message)
    console.log('---')
    const messageId = `stub-${data.job.id}`
    await report({
      job: { id: data.job.id, status: 'SUBMITTED', messageId },
    })
    await report({
      job: { id: data.job.id, status: 'DELIVERED', messageId },
    })
  }
}

assertLocal()
console.log(`WhatsApp stub (uji, tidak kirim ke HP) → ${APP_URL}`)
console.log('OTP dan feedback tercetak di sini. Status admin: OPEN · mode uji.')

await report()
export {}
setInterval(() => {
  void tick().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'poll gagal'
    console.warn(`[stub] ${message}`)
  })
}, 2000)
setInterval(() => {
  void report().catch(() => {})
}, 15_000)
