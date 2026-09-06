import * as SecureStore from 'expo-secure-store'
import { API_URL } from './config'

const TOKEN_KEY = 'ternak_nfc_token'

export type Owner = {
  email: string
  name: string | null
  role: string
}

export type Card = {
  publicId: string
  redirectUrl: string
  batchId: string | null
  batchLabel: string | null
  batchSeq: number | null
  nfcEncodedAt: string | Date | null
}

export type AppUrlInfo = {
  url: string
  host: string
  isLocal: boolean
  isHttps: boolean
  production: boolean
}

export type StockBatch = {
  id: string
  label: string
  count: number
  encoded: number
  inStock: number
  available: number
  assigned: number
  remaining: number
  readyStock: number
  active: number
  inactive: number
  next: 'print' | 'nfc' | 'ready'
  createdAt: string
}

type ApiError = { ok?: boolean; error?: string }

async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string | null) {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token)
  else await SecureStore.deleteItemAsync(TOKEN_KEY)
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.auth !== false) {
    const token = await getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })
  const data = (await response.json().catch(() => null)) as
    | (T & ApiError)
    | null
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Gagal (${response.status})`)
  }
  return data as T
}

export async function login(email: string, password: string) {
  const data = await request<{ token: string; owner: Owner }>(
    '/api/mobile/login',
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    },
  )
  await setToken(data.token)
  return data.owner
}

export async function logout() {
  try {
    await request('/api/mobile/logout', { method: 'POST' })
  } catch {
    // drop local token even if the server session is already gone
  }
  await setToken(null)
}

export async function fetchMe() {
  const data = await request<{ owner: Owner }>('/api/mobile/me')
  return data.owner
}

export async function lookupCard(ref: string) {
  const data = await request<{ card: Card }>('/api/mobile/nfc/lookup', {
    method: 'POST',
    body: JSON.stringify({ ref }),
  })
  return data.card
}

export async function markCard(ref: string) {
  const data = await request<{ card: Card }>('/api/mobile/nfc/mark', {
    method: 'POST',
    body: JSON.stringify({ ref }),
  })
  return data.card
}

export async function fetchNfcSession() {
  return request<{ appUrl: AppUrlInfo; batches: StockBatch[] }>(
    '/api/mobile/nfc/batches',
  )
}

export async function generateStock(input: { count: number; label?: string }) {
  return request<{ batchId: string; label: string; count: number }>(
    '/api/mobile/stock/generate',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function deleteStock(batchId: string) {
  return request<{ ok: true }>('/api/mobile/stock/delete', {
    method: 'POST',
    body: JSON.stringify({ batchId }),
  })
}
