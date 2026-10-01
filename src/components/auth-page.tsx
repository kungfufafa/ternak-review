"use client"

import { useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { AtSignIcon, KeyRoundIcon, LockIcon, PhoneIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
import { homePath } from '#/lib/access'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
} from '#/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import {
  getCurrentOwnerFn,
  loginPasswordFn,
  registerPasswordFn,
  requestEmailLoginOtpFn,
  requestLoginOtpFn,
  verifyEmailLoginOtpFn,
  verifyLoginOtpFn,
} from '#/server/functions'

type LoginMode = 'wa' | 'email' | 'password'

export function AuthPage({
  adminExists,
  whatsappOtp = false,
  emailOtp = false,
  activation,
  partnerRef,
}: {
  adminExists: boolean
  whatsappOtp?: boolean
  emailOtp?: boolean
  activation?: string
  partnerRef?: string
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const currentOwner = useServerFn(getCurrentOwnerFn)
  const loginPassword = useServerFn(loginPasswordFn)
  const registerPassword = useServerFn(registerPasswordFn)
  const requestOtp = useServerFn(requestLoginOtpFn)
  const verifyOtp = useServerFn(verifyLoginOtpFn)
  const requestEmailOtp = useServerFn(requestEmailLoginOtpFn)
  const verifyEmailOtp = useServerFn(verifyEmailLoginOtpFn)
  const isSetup = !adminExists
  const [mode, setMode] = useState<LoginMode>(() => {
    if (isSetup) return 'password'
    if (emailOtp) return 'email'
    if (whatsappOtp) return 'wa'
    return 'password'
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [code, setCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  async function goIn() {
    await router.invalidate()
    const me = await currentOwner()
    if (activation) {
      await navigate({ to: '/activate', search: { id: activation, ref: partnerRef } })
    } else {
      await navigate({ to: homePath(me?.permissions ?? 'USER') })
    }
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isSetup) {
        await registerPassword({ data: { email, password, setupToken } })
      } else {
        await loginPassword({ data: { email, password } })
      }
      await goIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
    } finally {
      setBusy(false)
    }
  }

  async function onRequestOtp(e?: React.FormEvent) {
    e?.preventDefault()
    if (busy || resendSeconds > 0) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const result =
        mode === 'email'
          ? await requestEmailOtp({ data: { email } })
          : await requestOtp({ data: { whatsapp } })
      setOtpSent(true)
      setCode('')
      setResendSeconds(60)
      setInfo(result.sent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim kode.')
    } finally {
      setBusy(false)
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'email') {
        await verifyEmailOtp({ data: { email, code } })
      } else {
        await verifyOtp({ data: { whatsapp, code } })
      }
      await goIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kode belum cocok.')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: LoginMode) {
    setMode(next)
    setError(null)
    setInfo(null)
    setOtpSent(false)
    setCode('')
    setResendSeconds(0)
  }

  const useOtp = !isSetup && (mode === 'wa' || mode === 'email')

  return (
    <AuthShell>
      <AuthTitle
        description={activation ? `Masuk untuk melanjutkan aktivasi kartu ${activation}.` : isSetup ? 'Penyiapan akun admin pertama.' : 'Gunakan akun yang telah dibuat oleh admin.'}
        title={
          isSetup ? (
            <>
              Buat <em className="text-pine italic">akun</em>
            </>
          ) : mode === 'wa' ? (
            <>
              Masuk lewat <em className="text-pine italic">WhatsApp</em>
            </>
          ) : mode === 'email' ? (
            <>
              Masuk lewat <em className="text-pine italic">email</em>
            </>
          ) : (
            <>
              Masuk <em className="text-pine italic">password</em>
            </>
          )
        }
      />
      <Card>
        <form onSubmit={useOtp ? (otpSent ? onVerifyOtp : onRequestOtp) : onPassword}>
          <CardContent className="flex flex-col gap-3 p-6">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {info ? <Alert variant="success">{info}</Alert> : null}
            {mode === 'wa' && useOtp ? (
              <InputGroup>
                <InputGroupInput
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={32}
                  onChange={(e) => {
                    setWhatsapp(e.target.value)
                    setOtpSent(false)
                    setCode('')
                    setInfo(null)
                  }}
                  placeholder="08xxxxxxxxxx"
                  required
                  value={whatsapp}
                />
                <InputGroupAddon align="inline-start">
                  <PhoneIcon />
                </InputGroupAddon>
              </InputGroup>
            ) : null}
            {mode === 'email' && useOtp ? (
              <InputGroup>
                <InputGroupInput
                  autoComplete="email"
                  maxLength={254}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setOtpSent(false)
                    setCode('')
                    setInfo(null)
                  }}
                  placeholder="Email"
                  required
                  type="email"
                  value={email}
                />
                <InputGroupAddon align="inline-start">
                  <AtSignIcon />
                </InputGroupAddon>
              </InputGroup>
            ) : null}
            {useOtp && otpSent ? (
              <InputGroup>
                <InputGroupInput
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Kode 6 digit"
                  required
                  value={code}
                />
                <InputGroupAddon align="inline-start">
                  <KeyRoundIcon />
                </InputGroupAddon>
              </InputGroup>
            ) : null}
            {mode === 'password' || isSetup ? (
              <>
                <InputGroup>
                  <InputGroupInput
                    autoComplete="email"
                    maxLength={254}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    type="email"
                    value={email}
                  />
                  <InputGroupAddon align="inline-start">
                    <AtSignIcon />
                  </InputGroupAddon>
                </InputGroup>
                <InputGroup>
                  <InputGroupInput
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    maxLength={200}
                    minLength={6}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kata sandi"
                    required
                    type="password"
                    value={password}
                  />
                  <InputGroupAddon align="inline-start">
                    <LockIcon />
                  </InputGroupAddon>
                </InputGroup>
                {isSetup ? (
                  <InputGroup>
                    <InputGroupInput
                      autoComplete="one-time-code"
                      maxLength={512}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder="Token setup dari environment"
                      required
                      type="password"
                      value={setupToken}
                    />
                    <InputGroupAddon align="inline-start">
                      <KeyRoundIcon />
                    </InputGroupAddon>
                  </InputGroup>
                ) : null}
              </>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" disabled={busy || (useOtp && !otpSent && resendSeconds > 0)} size="lg" type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy
                ? 'Menunggu…'
                : isSetup
                  ? 'Buat akun'
                  : useOtp
                    ? otpSent
                      ? 'Masuk'
                      : resendSeconds > 0 ? `Kirim kode (${resendSeconds} dtk)` : 'Kirim kode'
                    : 'Masuk'}
            </Button>
            {useOtp && otpSent ? (
              <Button
                className="w-full"
                disabled={busy || resendSeconds > 0}
                onClick={() => void onRequestOtp()}
                type="button"
                variant="outline"
              >
                {resendSeconds > 0 ? `Kirim ulang kode (${resendSeconds} dtk)` : 'Kirim ulang kode'}
              </Button>
            ) : null}
            {!isSetup && whatsappOtp && mode !== 'wa' ? (
              <Button
                className="w-full"
                onClick={() => switchMode('wa')}
                type="button"
                variant="outline"
              >
                Masuk dengan WhatsApp
              </Button>
            ) : null}
            {!isSetup && emailOtp && mode !== 'email' ? (
              <Button
                className="w-full"
                onClick={() => switchMode('email')}
                type="button"
                variant="outline"
              >
                Masuk dengan kode email
              </Button>
            ) : null}
            {!isSetup && mode !== 'password' ? (
              <Button
                className="w-full"
                onClick={() => switchMode('password')}
                type="button"
                variant="outline"
              >
                Masuk dengan password
              </Button>
            ) : null}
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  )
}
