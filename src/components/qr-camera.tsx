import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Button } from '#/components/ui/button'

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
}

function makeBarcodeDetector(): Detector | null {
  const Ctor = (
    window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => Detector
    }
  ).BarcodeDetector
  if (!Ctor) return null
  return new Ctor({ formats: ['qr_code'] })
}

function readFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): string | null {
  const maxW = 640
  const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1
  const width = Math.max(1, Math.floor(video.videoWidth * scale))
  const height = Math.max(1, Math.floor(video.videoHeight * scale))
  canvas.width = width
  canvas.height = height
  ctx.drawImage(video, 0, 0, width, height)
  const image = ctx.getImageData(0, 0, width, height)
  return jsQR(image.data, width, height)?.data?.trim() ?? null
}

export function canScanQr() {
  return (
    typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

export function QrCamera({
  onCode,
  paused,
}: {
  onCode: (raw: string) => void
  paused?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)

  onCodeRef.current = onCode
  pausedRef.current = paused

  useEffect(() => {
    if (!armed) return

    let stream: MediaStream | null = null
    let timer = 0
    let cancelled = false
    const video = videoRef.current
    const barcode = makeBarcodeDetector()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        })
      } catch {
        if (!cancelled) {
          setBlocked('Izinkan kamera, atau scan pakai kotak di bawah.')
        }
        return
      }
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      video.setAttribute('playsinline', 'true')
      video.srcObject = stream
      await video.play()

      const tick = async () => {
        if (cancelled || !video) return
        if (!pausedRef.current && video.readyState >= 2) {
          try {
            let raw: string | null = null
            if (barcode) {
              const codes = await barcode.detect(video)
              raw = codes[0]?.rawValue?.trim() ?? null
            } else if (ctx) {
              raw = readFrame(video, canvas, ctx)
            }
            if (raw) onCodeRef.current(raw)
          } catch {
            // keep scanning
          }
        }
        timer = window.setTimeout(tick, 280)
      }
      void tick()
    }

    void start()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [armed])

  if (blocked) {
    return (
      <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground">
        {blocked}
      </p>
    )
  }

  if (!armed) {
    return (
      <Button
        className="w-full"
        onClick={() => setArmed(true)}
        size="lg"
        type="button"
        variant="outline"
      >
        Nyalakan kamera
      </Button>
    )
  }

  return (
    <video
      autoPlay
      className="aspect-[4/3] w-full rounded-2xl bg-card object-cover"
      muted
      playsInline
      ref={videoRef}
    />
  )
}
