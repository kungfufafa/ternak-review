import { Alert } from '#/components/ui/alert'
import type { AppUrlInfo } from '#/lib/env'

export function AppUrlBanner({ info }: { info: AppUrlInfo }) {
  if (info.isLocal || !info.isHttps) {
    return (
      <Alert variant="danger">
        QR dan NFC akan mengarah ke <span className="font-mono">{info.url}</span>.
        Set <span className="font-mono">APP_URL</span> ke HTTPS produksi sebelum
        cetak atau tulis chip — kartu yang sudah jadi tidak ikut pindah domain.
      </Alert>
    )
  }

  return (
    <Alert>
      QR dan NFC memakai <span className="font-mono">{info.url}</span>
    </Alert>
  )
}
