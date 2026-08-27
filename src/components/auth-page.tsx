"use client"

import { useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { AtSignIcon, KeyRoundIcon, LockIcon } from 'lucide-react'
import { useState } from 'react'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
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
import { loginPasswordFn, registerPasswordFn } from '#/server/functions'

export function AuthPage({
  adminExists,
}: {
  adminExists: boolean
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const loginPassword = useServerFn(loginPasswordFn)
  const registerPassword = useServerFn(registerPasswordFn)
  const isSetup = !adminExists

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isSetup) {
        await registerPassword({ data: { email, password, setupToken } })
      } else {
        await loginPassword({ data: { email, password } })
      }
      await router.invalidate()
      await navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <AuthTitle
        title={
          isSetup ? (
            <>
              Buat <em className="text-pine italic">akun</em>
            </>
          ) : (
            <>
              Masuk <em className="text-pine italic">admin</em>
            </>
          )
        }
      />
      <Card>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-3 p-6">
            {error ? <Alert variant="danger">{error}</Alert> : null}
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
                minLength={isSetup ? 12 : 8}
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
          </CardContent>
          <CardFooter>
            <Button className="w-full" disabled={busy} size="lg" type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Menunggu…' : isSetup ? 'Buat akun' : 'Masuk'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  )
}
