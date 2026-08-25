type NdefWriter = {
  write: (message: {
    records: Array<{ recordType: string; data: string }>
  }) => Promise<void>
  scan: () => Promise<void>
  addEventListener: (
    type: 'reading',
    listener: (event: {
      message: { records: Array<{ recordType: string; data?: BufferSource }> }
    }) => void,
    options?: { once?: boolean },
  ) => void
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

export async function readNfcUrl() {
  if (!canWriteNfc()) {
    throw new Error('Baca NFC hanya di Chrome Android.')
  }
  const ndef = reader()
  await ndef.scan()
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('Tidak ada tap. Dekatkan stiker.')),
      20_000,
    )
    ndef.addEventListener(
      'reading',
      (event) => {
        window.clearTimeout(timer)
        for (const record of event.message.records) {
          if (record.recordType === 'url' && record.data) {
            const text = new TextDecoder().decode(record.data)
            resolve(text)
            return
          }
        }
        reject(new Error('Stiker tidak berisi URL Ternak Review.'))
      },
      { once: true },
    )
  })
}
