import { Platform } from 'react-native'
import NfcManager, { Ndef, NfcTech, type TagEvent } from 'react-native-nfc-manager'

let started = false

async function ensureStarted() {
  const supported = await NfcManager.isSupported()
  if (!supported) {
    throw new Error('HP ini tidak punya NFC.')
  }
  if (!started) {
    await NfcManager.start()
    started = true
  }
}

export async function getNfcStatus() {
  try {
    const supported = await NfcManager.isSupported()
    if (!supported) return { supported: false, enabled: false }
    if (!started) {
      await NfcManager.start()
      started = true
    }
    const enabled =
      Platform.OS === 'android' ? await NfcManager.isEnabled() : true
    return { supported: true, enabled }
  } catch {
    return { supported: false, enabled: false }
  }
}

export async function openNfcSettings() {
  if (Platform.OS === 'android') {
    await NfcManager.goToNfcSetting().catch(() => {})
  }
}

function payloadBytes(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) return payload
  if (Array.isArray(payload)) return Uint8Array.from(payload as number[])
  return new Uint8Array()
}

export function urlFromTag(tag: TagEvent | null): string | null {
  const records = tag?.ndefMessage ?? []
  for (const record of records) {
    try {
      const type = record.type
      const uriType =
        Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI) ||
        type === 'U' ||
        (Array.isArray(type) && type[0] === 0x55)
      if (!uriType) continue
      const url = Ndef.uri.decodePayload(payloadBytes(record.payload))
      if (url?.trim()) return url.trim()
    } catch {
      // skip malformed records
    }
  }
  return null
}

export async function readNfcUrl(): Promise<string | null> {
  await ensureStarted()
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: 'Tempel HP ke stiker untuk membaca.',
    })
    const tag = await NfcManager.getTag()
    await NfcManager.setAlertMessage('Terbaca').catch(() => {})
    return urlFromTag(tag)
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {})
  }
}

export async function writeNfcUrl(url: string) {
  await ensureStarted()
  if (Platform.OS === 'android') {
    const enabled = await NfcManager.isEnabled()
    if (!enabled) {
      await openNfcSettings()
      throw new Error('Nyalakan NFC di pengaturan, lalu tempel lagi.')
    }
  }
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: 'Tempel HP ke stiker untuk menulis URL.',
    })
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(url)])
    if (!bytes?.length) throw new Error('Gagal menyusun NDEF.')
    await NfcManager.ndefHandler.writeNdefMessage(bytes)
    await NfcManager.setAlertMessage('Tersimpan').catch(() => {})
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {})
  }
}

export function friendlyNfcError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/cancel|userCancel|session invalidated/i.test(message)) {
    return 'Batal. Tempel lagi kalau mau lanjut.'
  }
  if (/not support|nfc/i.test(message) && /support/i.test(message)) {
    return 'HP ini tidak punya NFC.'
  }
  if (message) return message
  return 'Belum ke-tap. Tempel HP lebih dekat ke stiker.'
}
