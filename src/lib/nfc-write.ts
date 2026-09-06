type NdefWriter = {
  write: (message: {
    records: Array<{ recordType: string; data: string }>
  }) => Promise<void>
}

function reader() {
  const NDEFReader = (
    window as unknown as { NDEFReader: new () => NdefWriter }
  ).NDEFReader
  return new NDEFReader()
}

export function canWriteNfc() {
  return typeof window !== 'undefined' && 'NDEFReader' in window
}

export const canReadNfc = canWriteNfc

type NdefReadingEvent = Event & {
  message?: {
    records?: Array<{
      recordType?: string
      data?: ArrayBuffer | string
    }>
  }
}

export async function readNfcRaw(timeoutMs = 20_000): Promise<string> {
  if (!canReadNfc()) {
    throw new Error('Baca NFC di Chrome Android, atau scan QR-nya.')
  }
  const NDEFReader = (
    window as unknown as { NDEFReader: new () => {
      scan: (opts?: { signal?: AbortSignal }) => Promise<void>
      addEventListener: (
        type: 'reading',
        listener: (event: NdefReadingEvent) => void,
        opts?: { once?: boolean },
      ) => void
    } }
  ).NDEFReader
  const ndef = new NDEFReader()
  const abort = new AbortController()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      abort.abort()
      reject(new Error('Tidak ada tap. Tempel HP ke kartu, lalu coba lagi.'))
    }, timeoutMs)
    ndef.addEventListener(
      'reading',
      (event) => {
        window.clearTimeout(timer)
        abort.abort()
        const record = event.message?.records?.[0]
        if (!record?.data) {
          reject(new Error('Kartu NFC kosong.'))
          return
        }
        const text =
          typeof record.data === 'string'
            ? record.data
            : new TextDecoder().decode(record.data)
        if (!text.trim()) {
          reject(new Error('Kartu NFC kosong.'))
          return
        }
        resolve(text.trim())
      },
      { once: true },
    )
    ndef.scan({ signal: abort.signal }).catch((error: unknown) => {
      window.clearTimeout(timer)
      reject(error)
    })
  })
}

export function isIos() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export async function writeNfcUrl(url: string) {
  if (!canWriteNfc()) {
    throw new Error(
      'Tulis NFC di Chrome Android. Buka halaman Tempel NFC di HP, lalu tempel ke stiker.',
    )
  }
  await reader().write({
    records: [{ recordType: 'url', data: url }],
  })
}
