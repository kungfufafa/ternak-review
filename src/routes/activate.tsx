import { createFileRoute, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { UserIcon } from 'lucide-react'
import { useState } from 'react'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
import { PlacePicker } from '#/components/place-picker'
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
  activateUnitFn,
  getActivationCardFn,
  placeDetailsFn,
} from '#/server/functions'

type Step = 'outlet' | 'confirm' | 'done'

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
      return { card: null as null }
    }
    const card = await getActivationCardFn({
      data: { publicId: deps.id },
    })
    if (!card) {
      return { card: null as null }
    }
    if (card.status === 'ACTIVE') {
      throw redirect({ href: `/r/${card.publicId}` })
    }
    if (card.status === 'INACTIVE') {
      throw redirect({
        search: { id: card.publicId, state: 'inactive' },
        to: '/r-status',
      })
    }
    return { card }
  },
  component: ActivatePage,
  head: () => ({
    meta: [{ title: 'Pilih toko — Ternak Review' }],
  }),
})

function ActivatePage() {
  const { id: prefillId = '', ref: prefillRef = '' } = Route.useSearch()
  const { card } = Route.useLoaderData()
  const detailsFn = useServerFn(placeDetailsFn)
  const activateFn = useServerFn(activateUnitFn)

  const publicId = (card?.publicId ?? prefillId).toUpperCase()
  const [step, setStep] = useState<Step>('outlet')
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

  async function onPickPlace(placeId: string) {
    setError(null)
    setBusy(true)
    try {
      const details = await detailsFn({
        data: { placeId, sessionToken },
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
          title={
            <>
              Scan <em className="text-pine italic">kartunya</em>
            </>
          }
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell wide>
      <AuthTitle
        title={
          step === 'outlet' ? (
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

      {step === 'outlet' ? (
        <PlacePicker
          disabled={busy}
          onPick={(placeId) => {
            void onPickPlace(placeId)
          }}
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
          <InputGroup>
            <InputGroupInput
              onChange={(event) => setPartnerRef(event.target.value)}
              placeholder="Nama kamu (opsional)"
              value={partnerRef}
            />
            <InputGroupAddon align="inline-start">
              <UserIcon />
            </InputGroupAddon>
          </InputGroup>
          <div className="flex gap-2">
            <Button
              className="flex-1"
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
              Ganti
            </Button>
            <Button className="flex-1" disabled={busy} size="lg" type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Menyimpan…' : 'Pasang'}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'done' && result ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Tamu tinggal tempel HP atau scan QR — langsung ke review{' '}
              <span className="text-foreground">{result.outletName}</span>.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full" size="lg">
              <a href={`/r/${result.publicId}`}>Coba</a>
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </AuthShell>
  )
}
