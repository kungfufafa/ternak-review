import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys'
import pino from 'pino'

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const TOKEN = process.env.WHATSAPP_GATEWAY_TOKEN ?? 'local-whatsapp-gateway-token'
const WORKER_ID = process.env.WHATSAPP_GATEWAY_WORKER_ID ?? `gateway-${process.pid}`
const DB_PATH = process.env.WHATSAPP_GATEWAY_DB ?? './data/whatsapp-gateway.db'
const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_values (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS signal_keys (name TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(name, id));
  CREATE TABLE IF NOT EXISTS sent_messages (id TEXT PRIMARY KEY, remote_jid TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS job_messages (job_id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS command_receipts (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
`)

const json = (value) => JSON.stringify(value, BufferJSON.replacer)
const parse = (value) => JSON.parse(value, BufferJSON.reviver)

function readAuth(name) {
  const row = db.prepare('SELECT value FROM auth_values WHERE name = ?').get(name)
  return row ? parse(row.value) : null
}

function writeAuth(name, value) {
  db.prepare('INSERT INTO auth_values(name, value) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .run(name, json(value))
}

function deleteAuth(name) {
  db.prepare('DELETE FROM auth_values WHERE name = ?').run(name)
}

function makeAuthState() {
  const creds = readAuth('creds') ?? initAuthCreds()
  const keys = {
    async get(type, ids) {
      const out = {}
      for (const id of ids) {
        const row = db.prepare('SELECT value FROM signal_keys WHERE name = ? AND id = ?').get(type, id)
        if (row) out[id] = parse(row.value)
      }
      return out
    },
    async set(data) {
      const insert = db.prepare('INSERT INTO signal_keys(name, id, value) VALUES(?, ?, ?) ON CONFLICT(name, id) DO UPDATE SET value = excluded.value')
      const remove = db.prepare('DELETE FROM signal_keys WHERE name = ? AND id = ?')
      const transaction = db.transaction(() => {
        for (const [type, values] of Object.entries(data)) {
          for (const [id, value] of Object.entries(values)) {
            if (value == null) remove.run(type, id)
            else insert.run(type, id, json(value))
          }
        }
      })
      transaction()
    },
  }
  return {
    creds,
    keys: makeCacheableSignalKeyStore(keys, log),
    saveCreds: () => writeAuth('creds', creds),
  }
}

function authHeader() {
  return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
}

async function post(path, body) {
  const response = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response.json()
}

let socket = null
let socketGen = 0
let auth = null
let reconnectTimer = null
let reconnectDelay = 2000
let currentStatus = 'OFFLINE'
let starting = false
let allowReconnect = true

async function report(body = {}) {
  try {
    await post('/api/internal/whatsapp/report', {
      workerId: WORKER_ID,
      status: currentStatus,
      ...body,
    })
  } catch (error) {
    log.warn({ error: error.message }, 'gateway report failed')
  }
}

function setStatus(status, extra = {}) {
  currentStatus = status
  void report(extra)
}

function clearReconnect() {
  if (!reconnectTimer) return
  clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function scheduleReconnect() {
  if (!allowReconnect || starting || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void startSocket()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
}

function dropSocket() {
  const current = socket
  socket = null
  socketGen += 1
  if (!current) return
  try {
    current.end(undefined)
  } catch {
    // Closing a replaced session can throw; the new socket is what matters.
  }
}

async function startSocket({ force = false } = {}) {
  if (starting) return
  if (!force && (currentStatus === 'OPEN' || currentStatus === 'CONNECTING' || currentStatus === 'QR')) {
    return
  }
  starting = true
  allowReconnect = true
  clearReconnect()
  dropSocket()
  const gen = socketGen
  try {
    auth = makeAuthState()
    setStatus('CONNECTING')
    const next = makeWASocket({
      auth: auth,
      logger: log,
      printQRInTerminal: false,
      getMessage: async (key) => {
        if (!key.id) return undefined
        const row = db.prepare('SELECT payload FROM sent_messages WHERE id = ?').get(key.id)
        if (!row) return undefined
        return proto.Message.fromObject(parse(row.payload))
      },
    })
    if (gen !== socketGen) {
      try {
        next.end(undefined)
      } catch {
        // Replaced before listeners attached.
      }
      return
    }
    socket = next
    socket.ev.on('creds.update', auth.saveCreds)
    socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (gen !== socketGen) return
      if (qr) setStatus('QR', { qr })
      if (connection === 'open') {
        reconnectDelay = 2000
        setStatus('OPEN')
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        if (socket === next) socket = null
        if (code === DisconnectReason.loggedOut) {
          allowReconnect = false
          db.prepare('DELETE FROM auth_values').run()
          db.prepare('DELETE FROM signal_keys').run()
          setStatus('LOGGED_OUT')
          return
        }
        setStatus('OFFLINE', { error: `connection closed (${code ?? 'unknown'})` })
        scheduleReconnect()
      }
    })
    socket.ev.on('messages.update', (updates) => {
      if (gen !== socketGen) return
      for (const update of updates) {
        const id = update.key?.id
        const status = update.update?.status
        if (!id || status == null || status < 4) continue
        const job = db.prepare('SELECT job_id FROM job_messages WHERE message_id = ?').get(id)
        if (job) void report({ job: { id: job.job_id, status: 'DELIVERED', messageId: id } })
      }
    })
  } finally {
    starting = false
  }
}

async function handleCommand(command) {
  if (!command || db.prepare('SELECT id FROM command_receipts WHERE id = ?').get(command.id)) return
  try {
    if (command.command === 'CONNECT') {
      if (currentStatus !== 'OPEN' && currentStatus !== 'QR' && currentStatus !== 'CONNECTING') {
        await startSocket()
      }
    } else if (command.command === 'RECONNECT') {
      await startSocket({ force: true })
    } else if (command.command === 'LOGOUT') {
      allowReconnect = false
      clearReconnect()
      if (socket) {
        try {
          await socket.logout()
        } catch {
          dropSocket()
        }
      }
      socket = null
      db.prepare('DELETE FROM auth_values').run()
      db.prepare('DELETE FROM signal_keys').run()
      setStatus('LOGGED_OUT')
    }
    db.prepare('INSERT INTO command_receipts(id, created_at) VALUES(?, ?)').run(command.id, Date.now())
    await report({ command: { id: command.id, status: 'ACKNOWLEDGED' } })
  } catch (error) {
    await report({ command: { id: command.id, status: 'FAILED', error: error.message } })
  }
}

async function deliver(job) {
  if (!socket || currentStatus !== 'OPEN') return
  const remoteJid = `${job.to}@s.whatsapp.net`
  const sentMapping = db.prepare('SELECT message_id FROM job_messages WHERE job_id = ?').get(job.id)
  if (sentMapping) {
    await report({ job: { id: job.id, status: 'SUBMITTED', messageId: sentMapping.message_id } })
    return
  }
  const prepared = db.prepare('SELECT id FROM sent_messages WHERE id = ?').get(job.id)
  if (prepared) {
    await report({ job: { id: job.id, status: 'UNCERTAIN', error: 'Pesan sudah dipersiapkan sebelum gateway restart.' } })
    return
  }
  let invoked = false
  try {
    db.prepare('INSERT OR REPLACE INTO sent_messages(id, remote_jid, payload, created_at) VALUES(?, ?, ?, ?)')
      .run(job.id, remoteJid, json({ conversation: { extendedTextMessage: { text: job.message } } }), Date.now())
    const sentMessage = await socket.sendMessage(remoteJid, { text: job.message })
    invoked = true
    if (sentMessage?.key?.id) {
      db.prepare('INSERT OR REPLACE INTO sent_messages(id, remote_jid, payload, created_at) VALUES(?, ?, ?, ?)')
        .run(sentMessage.key.id, remoteJid, json(sentMessage.message ?? {}), Date.now())
      db.prepare('INSERT OR REPLACE INTO job_messages(job_id, message_id) VALUES(?, ?)')
        .run(job.id, sentMessage.key.id)
    }
    await report({ job: { id: job.id, status: 'SUBMITTED', messageId: sentMessage?.key?.id ?? null } })
  } catch (error) {
    await report({
      job: {
        id: job.id,
        status: invoked ? 'UNCERTAIN' : 'FAILED',
        error: error.message,
      },
    })
  }
}

async function poll() {
  try {
    const data = await post('/api/internal/whatsapp/poll', {
      workerId: WORKER_ID,
      connected: currentStatus === 'OPEN',
    })
    await handleCommand(data.command)
    if (data.job) await deliver(data.job)
  } catch (error) {
    log.warn({ error: error.message }, 'gateway poll failed')
  }
}

setInterval(() => void poll(), 2000)
setInterval(() => void report(), 15_000)
void startSocket()

process.on('SIGTERM', () => {
  db.close()
  process.exit(0)
})
