import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { KeyRoundIcon, UserIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
import { PlacePicker } from '#/components/place-picker'
import { ReviewPathFields } from '#/components/review-path-fields'
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
import type { ServiceTier } from '#/lib/review-settings'
import {
  activateUnitFn,
  getActivationCardFn,
  getCurrentOwnerFn,
  logoutFn,
  placeDetailsFn,
  verifyActivationAccessFn,
} from '#/server/functions'

type Step = 'pin' | 'outlet' | 'confirm' | 'done'

export const Route = createFileRoute('/activate')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { id?: string; ref?: string } => {
    const next: { id?: string; ref?: string } = {}
    if (typeof search.id === 'string' && search.id.length > 0) {
      next.id = search.id
    }
    if (typeof search.ref === 'string' && search.ref.trim().length > 0) {
      next.ref = search.ref.trim().slice(0, 80)
    }
    return next
  },
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    if (!deps.id) {
      return { card: null as null, session: null }
    }
    const [card, session] = await Promise.all([
      getActivationCardFn({
        data: { publicId: deps.id },
      }),
      getCurrentOwnerFn(),
    ])
    if (!card) {
      return { card: null as null, session }
    }
    if (card.status !== 'IN_STOCK') {
      if (session?.role === 'ADMIN') {
        throw redirect({ params: { unitId: card.id }, to: '/dashboard/units/$unitId' })
      }
      if (session?.ownerId === card.ownerId) {
        throw redirect({
          params: { unitId: card.id },
          to: '/app/units/$unitId',
        })
      }
      if (card.status === 'ACTIVE') throw redirect({ href: `/r/${card.publicId}` })
    }
    if (card.status === 'INACTIVE') {
      throw redirect({
        search: { id: card.publicId, state: 'inactive' },
        to: '/r-status',
      })
    }
    return { card, session }
  },
  component: ActivatePage,
  head: () => ({
    meta: [{ title: 'Pilih toko — Ternak Review' }],
  }),
})

function ActivatePage() {
  const { id: prefillId = '', ref: prefillRef = '' } = Route.useSearch()
  const { card, session } = Route.useLoaderData()
  const detailsFn = useServerFn(placeDetailsFn)
  const activateFn = useServerFn(activateUnitFn)
  const verifyPinFn = useServerFn(verifyActivationAccessFn)
  const logout = useServerFn(logoutFn)
  const navigate = useNavigate()
  const router = useRouter()

  const publicId = (card?.publicId ?? prefillId).toUpperCase()
  const isAdmin = session?.role === 'ADMIN'
  const isHolder = Boolean(session?.ownerId && session.ownerId === card?.ownerId)
  const publicUnassigned = Boolean(
    !session && card?.status === 'IN_STOCK' && !card.ownerId,
  )
  const skipPin = isAdmin || isHolder || publicUnassigned
  const otherAccount = Boolean(
    session?.role === 'USER' &&
      card?.ownerId &&
      session.ownerId !== card.ownerId,
  )
  const [step, setStep] = useState<Step>(() => (skipPin ? 'outlet' : 'pin'))
  const [pin, setPin] = useState('')
  const [serviceTier, setServiceTier] = useState<ServiceTier>(
    () => card?.serviceTier ?? 'BASIC',
  )
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(
    () => card?.ownerWhatsapp ?? '',
  )
  const [partnerRef, setPartnerRef] = useState(prefillRef)
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID())
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [placePreview, setPlacePreview] = useState<{
    placeId: string
    name: string
    formattedAddress: string | null
    photoUrl: string | null
    googleMapsUri: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    publicId: string
    outletName: string
  } | null>(null)
  const flowCardRef = useRef<{ id: string; ref: string } | null>(null)

  useEffect(() => {
    if (!card) return
    const currentFlow = flowCardRef.current
    if (!currentFlow || currentFlow.id !== card.id) {
      flowCardRef.current = { id: card.id, ref: prefillRef }
      setStep(skipPin ? 'outlet' : 'pin')
      setPin('')
      setServiceTier(card.serviceTier)
      setOwnerWhatsapp(card.ownerWhatsapp ?? '')
      setPartnerRef(prefillRef)
      setSelectedPlaceId(null)
      setPlacePreview(null)
      setError(null)
      setResult(null)
      return
    }
    if (currentFlow.ref !== prefillRef) {
      flowCardRef.current = { ...currentFlow, ref: prefillRef }
      setPartnerRef(prefillRef)
    }
    // Login can replace the session while this route stays mounted. Move a
    // holder who just signed in past the PIN step without dropping the card.
    if (skipPin) {
      setStep((current) => (current === 'pin' ? 'outlet' : current))
    }
  }, [card, prefillRef, skipPin])

  async function onSwitchAccount() {
    setBusy(true)
    setError(null)
    try {
      await logout()
      await router.invalidate({ sync: true })
      await navigate({ to: '/login', search: { activation: publicId, ref: partnerRef || undefined } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal berganti akun.')
    } finally {
      setBusy(false)
    }
  }

  async function onVerifyPin(event: React.FormEvent) {
    event.preventDefault()
    if (!publicId) return
    setError(null)
    setBusy(true)
    try {
      await verifyPinFn({ data: { publicId, pin } })
      setStep('outlet')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN salah.')
    } finally {
      setBusy(false)
    }
  }

  async function onPickPlace(placeId: string) {
    setError(null)
    setBusy(true)
    try {
      const details = await detailsFn({
        data: { placeId, publicId, sessionToken },
      })
      setSelectedPlaceId(details.placeId)
      setPlacePreview(details)
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat tempat')
    } finally {
      setBusy(false)
    }
  }

  async function onActivate(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedPlaceId || !publicId) return
    setError(null)
    setBusy(true)
    try {
      const res = await activateFn({
        data: {
          publicId,
          placeId: selectedPlaceId,
          partnerRef: partnerRef.trim() || undefined,
          serviceTier,
          ownerWhatsapp: ownerWhatsapp.trim() || undefined,
          pin: skipPin ? undefined : pin,
        },
      })
      setResult({
        publicId: res.publicId,
        outletName: res.outlet.name,
      })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memasang toko')
    } finally {
      setBusy(false)
    }
  }

  if (!card) {
    return (
      <AuthShell center>
        <AuthTitle
          description={prefillId ? 'Kode kartu tidak ditemukan. Periksa kode atau scan ulang QR pada kartu.' : 'Buka tautan QR/NFC pada kartu, atau pilih kartu dari dashboard.'}
          title={
            <>
              Scan <em className="text-pine italic">kartunya</em>
            </>
          }
        />
        <Button asChild><Link to={session?.role === 'ADMIN' ? '/dashboard/units' : session ? '/app' : '/login'}>Buka daftar kartu</Link></Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell wide>
      <AuthTitle
        description={`Kartu ${publicId} · ${step === 'done' ? 'Aktivasi selesai' : step === 'confirm' ? 'Konfirmasi toko dan paket' : step === 'outlet' ? 'Pilih listing Google Maps yang sesuai' : 'Verifikasi pemegang kartu'}`}
        title={
          step === 'pin' ? (
            <>
              Masukkan <em className="text-pine italic">PIN</em>
            </>
          ) : step === 'outlet' ? (
            <>
              Pilih <em className="text-pine italic">toko</em>
            </>
          ) : step === 'confirm' ? (
            <>
              Ini <em className="text-pine italic">tokonya</em>?
            </>
          ) : (
            <>
              <em className="text-pine italic">Berhasil</em>
            </>
          )
        }
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {otherAccount && step === 'pin' ? (
        <Alert>
          Kamu masuk dengan akun lain. Pakai PIN pemegang kartu ini, atau masuk
          pakai akun yang memegangnya.
        </Alert>
      ) : null}
      {isAdmin && (step === 'outlet' || step === 'confirm') ? (
        <p className="text-sm text-muted-foreground">
          {card.ownerId
            ? 'Aktivasi sebagai admin. Kartu tetap terhubung ke akun pemegangnya.'
            : 'Kartu ini belum memiliki pemegang. Setelah aktivasi, tetapkan pemegang di detail kartu agar toko dapat mengelolanya.'}
        </p>
      ) : null}
      {publicUnassigned && (step === 'outlet' || step === 'confirm') ? (
        <p className="text-sm text-muted-foreground">
          Kartu publik ini belum memiliki pemegang. Pilih toko sekarang; admin
          dapat menetapkan pemegang setelah aktivasi.
        </p>
      ) : null}

      {step === 'pin' ? (
        <form className="flex flex-col gap-4" onSubmit={onVerifyPin}>
          <p className="text-sm text-muted-foreground">
            {card.ownerId
              ? 'Masukkan PIN aktivasi 4 digit dari admin, atau masuk dengan akun pemegang kartu ini untuk melanjutkan tanpa PIN.'
              : 'Kartu belum memiliki pemegang. PIN aktivasi akunmu akan menghubungkan kartu ini ke akun tersebut. Jika belum punya akun atau PIN, hubungi admin.'}
          </p>
          <InputGroup>
            <InputGroupInput
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              pattern="\d{4}"
              placeholder="••••"
              required
              value={pin}
            />
            <InputGroupAddon align="inline-start">
              <KeyRoundIcon />
            </InputGroupAddon>
          </InputGroup>
          <Button disabled={busy || pin.length !== 4} size="lg" type="submit">
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {busy ? 'Memeriksa…' : 'Lanjut'}
          </Button>
          {session ? (
            <Button disabled={busy} onClick={() => void onSwitchAccount()} size="lg" type="button" variant="outline">
              Keluar dan masuk dengan akun pemegang
            </Button>
          ) : card.ownerId ? (
            <Button asChild size="lg" variant="outline">
              <Link search={{ activation: publicId, ref: partnerRef || undefined }} to="/login">Masuk tanpa PIN</Link>
            </Button>
          ) : null}
        </form>
      ) : null}

      {step === 'outlet' ? (
        <PlacePicker
          disabled={busy}
          onPick={(placeId) => {
            void onPickPlace(placeId)
          }}
          publicId={publicId}
          sessionToken={sessionToken}
        />
      ) : null}

      {step === 'confirm' && placePreview ? (
        <form className="flex flex-col gap-4" onSubmit={onActivate}>
          <Card>
            {placePreview.photoUrl ? (
              <img
                alt=""
                className="h-40 w-full rounded-t-2xl object-cover"
                src={placePreview.photoUrl}
              />
            ) : null}
            <CardContent className={placePreview.photoUrl ? 'p-6' : 'p-6'}>
              <p className="text-lg font-medium tracking-tight">
                {placePreview.name}
              </p>
              {placePreview.formattedAddress ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {placePreview.formattedAddress}
                </p>
              ) : null}
            </CardContent>
          </Card>
          {prefillRef || partnerRef ? (
            <InputGroup>
              <InputGroupInput
                onChange={(event) => setPartnerRef(event.target.value)}
                aria-label="Kode rekanan"
                placeholder="Kode rekanan (opsional)"
                value={partnerRef}
              />
              <InputGroupAddon align="inline-start">
                <UserIcon />
              </InputGroupAddon>
            </InputGroup>
          ) : null}
          <ReviewPathFields
            allowTierChange
            onTierChange={setServiceTier}
            onWhatsappChange={setOwnerWhatsapp}
            ownerWhatsapp={ownerWhatsapp}
            packages={card.servicePackages}
            serviceTier={serviceTier}
            viewerRole={isAdmin ? 'ADMIN' : 'USER'}
            whatsappGatewayOpen={card.whatsappGatewayOpen}
          />
          <p className="text-sm text-muted-foreground">
            Pastikan nama dan alamat toko benar. Setelah diaktifkan, tamu yang
            tap atau scan akan mengikuti jalur review paket ini.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setSessionToken(crypto.randomUUID())
                setSelectedPlaceId(null)
                setPlacePreview(null)
                setStep('outlet')
              }}
              size="lg"
              type="button"
              variant="outline"
            >
              Ganti toko
            </Button>
            <Button className="flex-1" disabled={busy} size="lg" type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Mengaktifkan…' : 'Aktifkan kartu'}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'done' && result ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Kartu aktif untuk{' '}
              <span className="text-foreground">{result.outletName}</span>.
              Tamu tinggal tempel atau scan.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            {isAdmin ? (
              <>
                <Button asChild className="w-full" size="lg">
                  <Link params={{ unitId: card.id }} to="/dashboard/units/$unitId">Kelola kartu ini</Link>
                </Button>
                <Button asChild className="w-full" size="lg" variant="outline">
                  <a href={`/r/${result.publicId}`}>Coba sebagai tamu</a>
                </Button>
              </>
            ) : isHolder ? (
              <>
                <Button asChild className="w-full" size="lg">
                  <Link to="/app">Pasang kartu berikutnya</Link>
                </Button>
                <Button asChild className="w-full" size="lg" variant="outline">
                  <Link
                    params={{ unitId: card.id }}
                    to="/app/units/$unitId"
                  >
                    Lihat toko ini
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild className="w-full" size="lg">
                <a href={`/r/${result.publicId}`}>Coba sebagai tamu</a>
              </Button>
            )}
          </CardFooter>
        </Card>
      ) : null}
    </AuthShell>
  )
}
