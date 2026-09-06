export function parseCode(raw: string) {
  const text = raw.trim().toUpperCase()
  const qr = text.match(/\/R\/([2-9A-HJ-NP-Z]+)/)
  if (qr?.[1]) return { kind: 'qr' as const, id: qr[1] }
  const id = text.replace(/[^2-9A-HJ-NP-Z]/g, '')
  if (id.length >= 8) return { kind: 'id' as const, id }
  throw new Error('Kode tidak valid. Scan QR kartu.')
}
