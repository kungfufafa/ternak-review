import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { PageHeader } from '#/components/page'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  getWhatsappGatewayStatusFn,
  queueWhatsappCommandFn,
  testWhatsappFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/whatsapp')({
  loader: () => getWhatsappGatewayStatusFn(),
  component: WhatsappAdminPage,
  head: () => ({
    meta: [{ title: 'WhatsApp Gateway — Ternak Review' }],
  }),
})

function WhatsappAdminPage() {
  const initial = Route.useLoaderData()
  const statusFn = useServerFn(getWhatsappGatewayStatusFn)
  const commandFn = useServerFn(queueWhatsappCommandFn)
  const testFn = useServerFn(testWhatsappFn)
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState<string | null>(null)
  const [testTo, setTestTo] = useState('')
  const [qrImage, setQrImage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const next = await statusFn()
        if (!cancelled) setStatus(next)
      } catch {
        // Keep the last known state while the gateway is restarting.
      }
    }
    const timer = window.setInterval(() => void poll(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [statusFn])

  useEffect(() => {
    if (!status.qr) {
      setQrImage(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(status.qr, { margin: 1, width: 280 }).then((url) => {
      if (!cancelled) setQrImage(url)
    })
    return () => {
      cancelled = true
    }
  }, [status.qr])

  async function command(command: 'CONNECT' | 'RECONNECT' | 'LOGOUT') {
    setBusy(true)
    setError(null)
    setTested(null)
    try {
      await commandFn({ data: { command } })
      setStatus(await statusFn())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Perintah gateway gagal.')
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    setBusy(true)
    setError(null)
    setTested(null)
    try {
      const result = await testFn({ data: { to: testTo } })
      setStatus(await statusFn())
      setTested(
        result.testMode
          ? `Tes masuk antrean ke ${result.to}. Cek terminal stub dan Log kiriman.`
          : `Tes masuk antrean ke ${result.to}. Cek WhatsApp nomor itu dan Log kiriman.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tes kirim WhatsApp gagal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description="Satu nomor WhatsApp platform. Bukan di dalam Cloudflare: proses Baileys terpisah yang nyambung ke situs ini."
        title="WhatsApp Gateway"
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {status.testMode ? (
        <Alert>
          Mode uji. Pesan tidak dikirim ke WhatsApp sungguhan. Kode OTP dan isi
          feedback tercetak di terminal <code>npm run gateway:stub</code>, dan
          jejaknya di Log kiriman.
        </Alert>
      ) : null}
      {status.status === 'OFFLINE' && !status.testMode ? (
        <Alert>
          {status.cloudflare ? (
            <>
              WhatsApp tidak bisa jalan di dalam Cloudflare Workers — butuh
              proses Baileys terpisah (komputer/VPS yang nyala terus) yang
              poll ke situs ini. Jalankan gateway dengan{' '}
              <code>APP_URL=https://ternakreview.com</code> dan token yang sama
              dengan secret Cloudflare, lalu Hubungkan dan scan QR.
            </>
          ) : (
            <>
              Worker belum nyala. Lokal tanpa nomor:{' '}
              <code>npm run gateway:stub</code> (OTP masuk terminal + Log
              kiriman). Atau jalankan gateway Baileys, lalu Hubungkan dan scan
              QR.
            </>
          )}
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Status koneksi</span>
            <span className="text-sm font-normal text-muted-foreground">
              {status.status}
            </span>
          </CardTitle>
          <CardDescription>
            {status.workerId
              ? `Worker: ${status.workerId}${status.testMode ? ' · uji' : ''}`
              : 'Belum ada worker terhubung'}
            {status.pending > 0 ? ` · ${status.pending} pesan dalam antrean` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void command('CONNECT')} type="button">
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Hubungkan
          </Button>
          <Button
            disabled={busy}
            onClick={() => void command('RECONNECT')}
            type="button"
            variant="outline"
          >
            Sambungkan ulang
          </Button>
          <Button
            disabled={busy}
            onClick={() => void command('LOGOUT')}
            type="button"
            variant="destructive"
          >
            Logout nomor
          </Button>
        </CardContent>
      </Card>
      {qrImage ? (
        <Card>
          <CardHeader>
            <CardTitle>Scan QR dengan WhatsApp platform</CardTitle>
            <CardDescription>QR berlaku singkat dan hanya terlihat oleh admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <img alt="QR pairing WhatsApp" className="h-72 w-72 rounded-xl bg-white p-2" src={qrImage} />
          </CardContent>
        </Card>
      ) : null}
      {status.lastError ? <Alert variant="danger">{status.lastError}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Tes kirim</CardTitle>
          <CardDescription>
            Sama seperti tes email: pesan lewat antrean gateway. OPEN dulu.
            Mode uji tidak masuk HP — muncul di terminal stub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="wa-test-to">Nomor tujuan tes</FieldLabel>
            <Input
              id="wa-test-to"
              inputMode="tel"
              onChange={(event) => setTestTo(event.target.value)}
              placeholder="08xxxxxxxxxx"
              value={testTo}
            />
            <FieldDescription>
              {status.status === 'OPEN'
                ? 'Pakai nomor yang bisa kamu buka.'
                : 'Gateway harus OPEN sebelum tes kirim.'}
            </FieldDescription>
          </Field>
          {tested ? (
            <Alert className="mt-4" variant="success">
              {tested}
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            disabled={busy || status.status !== 'OPEN' || testTo.trim().length < 8}
            onClick={() => void onTest()}
            type="button"
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Tes kirim
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

