import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { KeyRoundIcon, UserIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
import { QrCamera, canScanQr } from '#/components/qr-camera'
import { PlacePicker } from '#/components/place-picker'
import { PlaceRatingLine } from '#/components/place-rating'
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
import { isStaff } from '#/lib/access'
import { parseCode } from '#/lib/card-code'
import { DEFAULT_TRIAL_DAYS } from '#/lib/place-rating'
import { REPORTING_TIME_ZONE } from '#/lib/reporting-time'
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

function trialPickupSentence(endsAt: number) {
  const date = new Date(endsAt).toLocaleDateString('id-ID', {
    timeZone: REPORTING_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const days = Math.ceil((endsAt - Date.now()) / 86_400_000)
  if (days <= 0) return `Ambil kartu ini hari ini, ${date}, kalau belum terjual.`
  if (days === 1) return `Ambil kartu ini besok, ${date}, kalau belum terjual.`
  return `Kalau belum terjual, ambil kartu ini pada ${date}.`
}

export const Route = createFileRoute('/activate')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { id?: string; ref?: string; place?: string } => {
    const next: { id?: string; ref?: string; place?: string } = {}
    if (typeof search.id === 'string' && search.id.length > 0) {
      next.id = search.id
    }
    if (typeof search.ref === 'string' && search.ref.trim().length > 0) {
      next.ref = search.ref.trim().slice(0, 80)
    }
    if (typeof search.place === 'string' && search.place.length > 1) {
      next.place = search.place
    }
    return next
  },
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    const session = await getCurrentOwnerFn()
    if (!deps.id) {
      return { card: null as null, session }
    }
    const card = await getActivationCardFn({
      data: { publicId: deps.id },
    })
    if (!card) {
      return { card: null as null, session }
    }
    if (card.status !== 'IN_STOCK') {
      if (session && isStaff(session.permissions)) {
        throw redirect({ params: { unitId: card.id }, to: '/dashboard/units/$unitId' })
      }
      if (card.isHolder) {
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
  const { id: prefillId = '', ref: prefillRef = '', place: prefillPlace } = Route.useSearch()
  const { card, session } = Route.useLoaderData()
  const detailsFn = useServerFn(placeDetailsFn)
  const activateFn = useServerFn(activateUnitFn)
  const verifyPinFn = useServerFn(verifyActivationAccessFn)
  const logout = useServerFn(logoutFn)
  const navigate = useNavigate()
  const router = useRouter()

  const publicId = (card?.publicId ?? prefillId).toUpperCase()
  const isAdmin = session ? isStaff(session.permissions) : false
  const isHolder = Boolean(card?.isHolder)
  // pinRequired is false when the PIN is switched off in the admin settings.
  const skipPin = isAdmin || isHolder || card?.pinRequired === false
  const otherAccount = Boolean(
    session && !isAdmin && card?.hasOwner && !isHolder,
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
    rating: number | null
    userRatingCount: number | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    publicId: string
    outletName: string
    pickupAt: number | null
    installKind: 'TRIAL' | 'SOLD'
  } | null>(null)
  const prefillStarted = useRef(false)
  const flowCardRef = useRef<{ id: string; ref: string } | null>(null)
  const [scanPaused, setScanPaused] = useState(false)
  const [cameraOk, setCameraOk] = useState(false)
  const lastScan = useRef('')

  useEffect(() => {
    setCameraOk(canScanQr())
  }, [])

  function onScanCard(raw: string) {
    setError(null)
    let id: string
    try {
      id = parseCode(raw).id
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR kartu tidak terbaca.')
      return
    }
    if (lastScan.current === id) return
    lastScan.current = id
    setScanPaused(true)
    void navigate({
      to: '/activate',
      search: {
        id,
        ...(prefillPlace ? { place: prefillPlace } : {}),
        ...(prefillRef ? { ref: prefillRef } : {}),
      },
    })
  }

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
      prefillStarted.current = false
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

  useEffect(() => {
    if (!prefillPlace || !skipPin || !card || step !== 'outlet' || prefillStarted.current) {
      return
    }
    prefillStarted.current = true
    void onPickPlace(prefillPlace)
  }, [card, prefillPlace, skipPin, step])

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
        data: {
          placeId,
          publicId,
          pin: skipPin ? undefined : pin,
          sessionToken,
        },
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

  async function onActivate(installKind: 'TRIAL' | 'SOLD') {
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
          installKind,
        },
      })
      setResult({
        publicId: res.publicId,
        outletName: res.outlet.name,
        pickupAt: res.prospect?.trialEndsAt ?? null,
        installKind,
      })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memasang toko')
    } finally {
      setBusy(false)
    }
  }

  if (!card) {
    const shopAlreadyChosen = Boolean(prefillPlace)
    return (
      <AuthShell center>
        <AuthTitle
          description={
            prefillId
              ? 'QR itu tidak membuka kartu. Scan QR pada kartu yang akan dipasang.'
              : shopAlreadyChosen
                ? 'Toko sudah dipilih. Scan QR pada kartu yang akan dipasang.'
                : 'Scan QR pada kartu. Setelah itu pilih tokonya.'
          }
          title={
            <>
              Scan <em className="text-pine italic">QR</em>
            </>
          }
        />
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {cameraOk ? (
          <QrCamera
            blockedMessage="Izinkan kamera untuk scan QR kartu."
            onCode={onScanCard}
            paused={scanPaused}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Buka kamera HP dan scan QR pada kartu.
          </p>
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell wide>
      <AuthTitle
        description={
          step === 'done'
            ? `Kartu ${publicId}`
            : `Kartu ${publicId} · ${step === 'confirm' ? 'Cek toko, lalu pasang' : step === 'outlet' ? 'Pilih toko yang akan dipasang' : 'Verifikasi pemegang kartu'}`
        }
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
              Kartu <em className="text-pine italic">terpasang</em>
            </>
          )
        }
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {otherAccount && step === 'pin' ? (
        <Alert>
          Kamu masuk dengan akun lain. Masukkan PIN pemegang kartu ini, atau
          masuk dengan akun yang memegangnya.
        </Alert>
      ) : null}
      {isAdmin && step === 'outlet' ? (
        <p className="text-sm text-muted-foreground">
          {card.hasOwner
            ? 'Kamu mengaktifkan sebagai admin. Pemegang yang sudah terhubung tetap mengelola kartu ini.'
            : 'Belum ada pemegang. Setelah toko terpasang, tetapkan akun di halaman kartu agar toko bisa kelola dari aplikasi.'}
        </p>
      ) : null}

      {step === 'pin' ? (
        <form className="flex flex-col gap-4" onSubmit={onVerifyPin}>
          <p className="text-sm text-muted-foreground">
            {card.hasOwner
              ? 'Masukkan PIN pemegang kartu ini. PIN memastikan yang mengaktifkan adalah orang yang tepat.'
              : 'Masukkan PIN akun yang akan memegang kartu ini.'}
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
          ) : card.hasOwner ? (
            <Button asChild size="lg" variant="outline">
              <Link search={{ activation: publicId, ref: partnerRef || undefined }} to="/login">Masuk tanpa PIN</Link>
            </Button>
          ) : null}
        </form>
      ) : null}

      {step === 'outlet' ? (
        <PlacePicker
          disabled={busy}
          pin={skipPin ? undefined : pin}
          onPick={(placeId) => {
            void onPickPlace(placeId)
          }}
          publicId={publicId}
          sessionToken={sessionToken}
        />
      ) : null}

      {step === 'confirm' && placePreview ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void onActivate('TRIAL')
          }}
        >
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
              <PlaceRatingLine
                className="mt-3"
                rating={placePreview.rating}
                showBand={false}
                userRatingCount={placePreview.userRatingCount}
              />
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
            compact
            onTierChange={setServiceTier}
            onWhatsappChange={setOwnerWhatsapp}
            ownerWhatsapp={ownerWhatsapp}
            packages={card.servicePackages}
            serviceTier={serviceTier}
            viewerRole={isAdmin ? 'ADMIN' : 'USER'}
            whatsappGatewayOpen={card.whatsappGatewayOpen}
          />
          <div className="flex flex-col gap-2">
            <Button disabled={busy} size="lg" type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Mengaktifkan…' : `Mulai trial ${DEFAULT_TRIAL_DAYS} hari`}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void onActivate('SOLD')}
              size="lg"
              type="button"
              variant="outline"
            >
              Sudah terjual
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setSessionToken(crypto.randomUUID())
                setSelectedPlaceId(null)
                setPlacePreview(null)
                setStep('outlet')
              }}
              size="lg"
              type="button"
              variant="ghost"
            >
              Ganti toko
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'done' && result ? (
        <Card>
          <CardContent className="flex flex-col gap-2 p-6">
            <p className="text-lg font-medium tracking-tight text-foreground">
              {result.outletName}
            </p>
            <p className="text-muted-foreground">
              Tamu sudah bisa tempel atau scan.
            </p>
            {result.installKind === 'TRIAL' && result.pickupAt != null ? (
              <p className="text-muted-foreground">
                {trialPickupSentence(result.pickupAt)}
              </p>
            ) : null}
            {result.installKind === 'SOLD' ? (
              <p className="text-muted-foreground">Kartu ini tetap di toko.</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            {isAdmin ? (
              <>
                <Button asChild className="w-full" size="lg">
                  <Link params={{ unitId: card.id }} to="/dashboard/units/$unitId">
                    {card.hasOwner ? 'Buka kartu' : 'Tetapkan pemegang'}
                  </Link>
                </Button>
                <Button asChild className="w-full" size="lg" variant="outline">
                  <a href={`/r/${result.publicId}`}>Lihat tampilan tamu</a>
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
                    Buka kartu ini
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild className="w-full" size="lg">
                <a href={`/r/${result.publicId}`}>Lihat tampilan tamu</a>
              </Button>
            )}
          </CardFooter>
        </Card>
      ) : null}
    </AuthShell>
  )
}
