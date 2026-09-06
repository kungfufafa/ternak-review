import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { PageHeader } from '#/components/page'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input, Select } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  getSmtpSettingsFn,
  saveSmtpSettingsFn,
  testSmtpFn,
} from '#/server/functions'

type MailProvider = 'smtp' | 'resend'

export const Route = createFileRoute('/admin/smtp')({
  loader: () => getSmtpSettingsFn(),
  component: SmtpPage,
  head: () => ({
    meta: [{ title: 'Email — Ternak Review' }],
  }),
})

function SmtpPage() {
  const settings = Route.useLoaderData()
  const saveFn = useServerFn(saveSmtpSettingsFn)
  const testFn = useServerFn(testSmtpFn)
  const router = useRouter()
  const [provider, setProvider] = useState<MailProvider>(settings.provider)
  const [host, setHost] = useState(settings.host)
  const [port, setPort] = useState(String(settings.port))
  const [secure, setSecure] = useState(settings.secure)
  const [username, setUsername] = useState(settings.username)
  const [password, setPassword] = useState('')
  const [fromName, setFromName] = useState(settings.fromName)
  const [fromEmail, setFromEmail] = useState(settings.fromEmail)
  const [enabled, setEnabled] = useState(settings.enabled)
  const [testTo, setTestTo] = useState(settings.fromEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [tested, setTested] = useState(false)

  const isResend = provider === 'resend'
  const secretReady = Boolean(password.trim()) || settings.hasPassword
  const canTest =
    secretReady &&
    (testTo || fromEmail).includes('@') &&
    (isResend || host.trim().length > 0)

  function portNumber() {
    const value = Number(port)
    return Number.isInteger(value) ? value : 587
  }

  function payload(nextEnabled: boolean) {
    return isResend
      ? {
          provider: 'resend' as const,
          host: 'smtp.resend.com',
          port: 465,
          secure: true,
          username: 'resend',
          password,
          fromName,
          fromEmail,
          enabled: nextEnabled,
        }
      : {
          provider: 'smtp' as const,
          host,
          port: portNumber(),
          secure,
          username,
          password,
          fromName,
          fromEmail,
          enabled: nextEnabled,
        }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      const result = await saveFn({ data: payload(enabled) })
      setPassword('')
      setEnabled(result.enabled)
      setProvider(result.provider)
      await router.invalidate({ sync: true })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pengaturan email gagal disimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await saveFn({ data: payload(false) })
      setPassword('')
      const result = await testFn({ data: { to: testTo || fromEmail } })
      setEnabled(result.enabled)
      setProvider(result.provider)
      await router.invalidate({ sync: true })
      setTested(true)
      setSaved(true)
    } catch (err) {
      setEnabled(false)
      await router.invalidate({ sync: true })
      setError(err instanceof Error ? err.message : 'Tes kirim email gagal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description="Resend pakai API key (jalan di Cloudflare). SMTP klasik untuk VPS/Node. Kalau aktif, kode OTP login (admin dan pemegang) plus PIN akun baru dikirim lewat saluran ini."
        title="Email keluar"
      />
      {isResend ? (
        <Alert>
          Di Resend: domain harus Verified, API key Sending access untuk domain
          itu (atau full access), email pengirim persis domain itu. Tes kirim
          dulu — baru aktif. API key disimpan terenkripsi.
        </Alert>
      ) : null}
      {!isResend && !settings.smtpSocketSupported ? (
        <Alert>
          SMTP socket tidak jalan di Cloudflare Workers. Pilih Resend, atau
          deploy VPS/Node.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Penyedia</CardTitle>
          <CardDescription>
            Resend: resend.com/domains → DNS → Verified, lalu API keys → key
            baru. SMTP: host seperti smtp.gmail.com atau smtp.mailgun.org.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSave}>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="mail-provider">Layanan</FieldLabel>
              <Select
                id="mail-provider"
                onChange={(event) =>
                  setProvider(event.target.value === 'resend' ? 'resend' : 'smtp')
                }
                value={provider}
              >
                <option value="resend">Resend (API key, Cloudflare OK)</option>
                <option value="smtp">SMTP klasik (VPS/Node)</option>
              </Select>
            </Field>
            {isResend ? (
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="smtp-password">API key Resend</FieldLabel>
                <Input
                  id="smtp-password"
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    settings.hasPassword && settings.provider === 'resend'
                      ? 'Tersimpan. Isi untuk ganti.'
                      : 're_xxxxxxxx'
                  }
                  type="password"
                  value={password}
                />
              </Field>
            ) : (
              <>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="smtp-host">Host</FieldLabel>
                  <Input
                    id="smtp-host"
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="smtp.gmail.com"
                    value={host}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="smtp-port">Port</FieldLabel>
                  <Select
                    id="smtp-port"
                    onChange={(event) => {
                      const next = event.target.value
                      setPort(next)
                      setSecure(next === '465')
                    }}
                    value={['25', '465', '587'].includes(port) ? port : '587'}
                  >
                    <option value="587">587 STARTTLS</option>
                    <option value="465">465 SSL</option>
                    <option value="25">25</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="smtp-user">Username</FieldLabel>
                  <Input
                    id="smtp-user"
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Biasanya sama dengan email pengirim"
                    value={username}
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="smtp-password">Password / app password</FieldLabel>
                  <Input
                    id="smtp-password"
                    autoComplete="new-password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      settings.hasPassword && settings.provider === 'smtp'
                        ? 'Tersimpan. Isi untuk ganti.'
                        : 'Password SMTP'
                    }
                    type="password"
                    value={password}
                  />
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor="smtp-from-name">Nama pengirim</FieldLabel>
              <Input
                id="smtp-from-name"
                onChange={(event) => setFromName(event.target.value)}
                placeholder="Ternak Review"
                value={fromName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="smtp-from-email">Email pengirim</FieldLabel>
              <Input
                id="smtp-from-email"
                onChange={(event) => setFromEmail(event.target.value)}
                placeholder={
                  isResend ? 'noreply@domain-yang-sudah-verified.com' : 'noreply@domainmu.com'
                }
                required={enabled}
                type="email"
                value={fromEmail}
              />
            </Field>
            <Field className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  type="checkbox"
                />
                Aktifkan pengiriman email
              </label>
              <FieldDescription>
                {settings.verifiedAt
                  ? `Tes terakhir berhasil ${new Date(settings.verifiedAt).toLocaleString('id-ID')}.`
                  : isResend
                    ? 'Kalau tes gagal “domain not verified”: domain di Resend belum Verified, atau API key-nya untuk domain lain.'
                    : 'Tes kirim dulu supaya yakin layanan menerima.'}
              </FieldDescription>
            </Field>
            {error ? <Alert className="md:col-span-2" variant="danger">{error}</Alert> : null}
            {saved ? (
              <Alert className="md:col-span-2" variant="success">
                Pengaturan email disimpan.
              </Alert>
            ) : null}
            {tested ? (
              <Alert className="md:col-span-2" variant="success">
                Email tes terkirim.
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button disabled={busy} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Simpan
            </Button>
            <div className="flex min-w-0 flex-1 gap-2">
              <Input
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="Email tujuan tes"
                type="email"
                value={testTo}
              />
              <Button
                disabled={busy || !canTest}
                onClick={() => void onTest()}
                type="button"
                variant="outline"
              >
                Tes kirim
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
