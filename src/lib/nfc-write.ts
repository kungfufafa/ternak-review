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
