import QRCode from 'qrcode'

export async function cardQrSvg(url: string) {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#202124', light: '#ffffff' },
  })
  return svg
    .replace(/\s(?:width|height)="[^"]*"/g, '')
    .replace('<svg', '<svg width="100%" height="100%"')
}

export async function cardQrMap(
  units: Array<{ publicId: string; redirectUrl: string }>,
  onProgress?: (done: number, total: number) => void,
) {
  const next: Record<string, string> = {}
  const chunkSize = 8
  for (let i = 0; i < units.length; i += chunkSize) {
    const slice = units.slice(i, i + chunkSize)
    const svgs = await Promise.all(slice.map((unit) => cardQrSvg(unit.redirectUrl)))
    slice.forEach((unit, index) => {
      next[unit.publicId] = svgs[index] ?? ''
    })
    onProgress?.(Object.keys(next).length, units.length)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  return next
}
