import { createFileRoute, Link, notFound, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { PlacePicker } from '#/components/place-picker'
import { PlaceRatingLine } from '#/components/place-rating'
import { PageHeader } from '#/components/page'
import { Sparkline } from '#/components/Sparkline'
import { StatusBadge } from '#/components/ui/badge'
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
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { packageNeedsOwnerWhatsapp, packageSetupCopy } from '#/lib/review-settings'
import {
  getMyUnitDetailFn,
  placeDetailsFn,
  rebindMyUnitOutletFn,
  updateMyUnitReviewSettingsFn,
} from '#/server/functions'

export const Route = createFileRoute('/app/units/$unitId')({
  loader: async ({ params }) => {
    const detail = await getMyUnitDetailFn({ data: { unitId: params.unitId } })
    if (!detail) throw notFound()
    if (detail.status === 'IN_STOCK') {
      throw redirect({
        to: '/activate',
        search: { id: detail.publicId },
      })
    }
    return { detail }
  },
  component: MyUnitPage,
  head: () => ({
    meta: [{ title: 'Kartu saya — Ternak Review' }],
  }),
})

function MyUnitPage() {
  const { detail } = Route.useLoaderData()
  const router = useRouter()
  const updateReview = useServerFn(updateMyUnitReviewSettingsFn)
  const detailsFn = useServerFn(placeDetailsFn)
  const rebindFn = useServerFn(rebindMyUnitOutletFn)
  const [changingPlace, setChangingPlace] = useState(false)
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID())
  const [pendingPlace, setPendingPlace] = useState<{
    placeId: string
    name: string
    address: string | null
    rating: number | null
    userRatingCount: number | null
  } | null>(null)
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(detail.ownerWhatsapp ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const servicePackage =
    detail.servicePackages.find((item) => item.serviceTier === detail.serviceTier) ??
    detail.servicePackages[0]
  const isActive = detail.status === 'ACTIVE'
  const needsWhatsapp = packageNeedsOwnerWhatsapp(detail.serviceTier)
  const whatsappChanged = ownerWhatsapp.trim() !== (detail.ownerWhatsapp ?? '')

  async function onPickNewPlace(placeId: string) {
    setError(null)
    setBusy(true)
    try {
      const details = await detailsFn({
        data: {
          placeId,
          publicId: detail.publicId,
          sessionToken,
        },
      })
      setPendingPlace({
        placeId: details.placeId,
        name: details.name,
        address: details.formattedAddress,
        rating: details.rating,
        userRatingCount: details.userRatingCount,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat toko.')
    } finally {
      setBusy(false)
    }
  }

  async function onRebind() {
    if (!pendingPlace) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await rebindFn({
        data: { unitId: detail.id, placeId: pendingPlace.placeId },
      })
      setChangingPlace(false)
      setPendingPlace(null)
      setSaved(true)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti toko.')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveReview(event: FormEvent) {
    event.preventDefault()
    if (!needsWhatsapp || !whatsappChanged) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const result = await updateReview({
        data: {
          unitId: detail.id,
          ownerWhatsapp: ownerWhatsapp.trim() || undefined,
        },
      })
      if (result.ok) {
        setOwnerWhatsapp(result.ownerWhatsapp ?? '')
        setSaved(true)
      } else {
        setError(result.error)
      }
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description={detail.outlet?.name ?? 'Belum diaktivasi'}
        title={detail.publicId}
      />
      <Link className="text-sm text-muted-foreground hover:text-foreground" to="/app">
        ← Kartu saya
      </Link>
      <div className="flex items-center gap-2">
        <StatusBadge status={detail.status} />
        {servicePackage ? (
          <span className="text-sm text-muted-foreground">{servicePackage.name}</span>
        ) : null}
      </div>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? <Alert variant="success">Perubahan disimpan.</Alert> : null}
      {!isActive ? (
        <Alert>
          Kartu ini nonaktif. Tamu yang memindai kartu belum bisa membuka halaman
          review. Hubungi admin untuk mengaktifkannya kembali.
        </Alert>
      ) : null}

      {detail.outlet ? (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <p className="font-medium">{detail.outlet.name}</p>
          {detail.outlet.address ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.outlet.address}
            </p>
          ) : null}
          {detail.outlet.baselineRating != null ||
          detail.outlet.baselineUserRatingCount != null ? (
            <PlaceRatingLine
              className="mt-3"
              rating={detail.outlet.baselineRating}
              userRatingCount={detail.outlet.baselineUserRatingCount}
            />
          ) : null}
          {isActive ? (
            <Button
              className="mt-3"
              disabled={busy}
              onClick={() => {
                setChangingPlace((open) => !open)
                setPendingPlace(null)
                setSessionToken(crypto.randomUUID())
              }}
              type="button"
              variant="outline"
            >
              {changingPlace ? 'Batal ganti toko' : 'Ganti toko tujuan'}
            </Button>
          ) : null}
          {isActive && changingPlace ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Pilih listing Google Maps yang benar. Setelah disimpan, pindai
                berikutnya membuka toko baru. Riwayat pemindaian tetap mengikuti
                kartu ini, termasuk pemindaian saat terhubung ke toko sebelumnya.
              </p>
              <PlacePicker
                disabled={busy}
                onPick={(placeId) => {
                  void onPickNewPlace(placeId)
                }}
                publicId={detail.publicId}
                sessionToken={sessionToken}
              />
              {pendingPlace ? (
                <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
                  <div>
                    <p className="font-medium">{pendingPlace.name}</p>
                    {pendingPlace.address ? (
                      <p className="text-sm text-muted-foreground">{pendingPlace.address}</p>
                    ) : null}
                    <PlaceRatingLine
                      className="mt-2"
                      rating={pendingPlace.rating}
                      userRatingCount={pendingPlace.userRatingCount}
                    />
                  </div>
                  <Button disabled={busy} onClick={() => void onRebind()} type="button">
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    Simpan toko tujuan
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl bg-card p-5">
        <p className="text-sm text-muted-foreground">Kunjungan melalui kartu</p>
        <p className="mt-1 text-2xl font-medium tabular-nums">{detail.totalClicks}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Jumlah pembukaan tautan kartu, bukan jumlah ulasan yang terkirim ke Google.
        </p>
        <div className="mt-4"><Sparkline data={detail.daily} /></div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paket dan tujuan review</CardTitle>
          <CardDescription>
            Paket: {servicePackage?.name ?? detail.serviceTier}. Hubungi admin
            jika ingin mengganti paket.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {servicePackage ? (
            <p className="text-sm text-muted-foreground">
              {!isActive ? 'Setelah kartu diaktifkan kembali: ' : null}
              {packageSetupCopy(detail.serviceTier, servicePackage.interceptMaxRating)}
            </p>
          ) : null}
          {detail.serviceTier === 'PRO' && !detail.whatsappGatewayOpen ? (
            <Alert>
              Pengiriman WhatsApp sedang offline. Masukan anonim tetap masuk ke
              Log kiriman dan menunggu dikirim ulang setelah gateway tersambung.
              Hubungi admin jika antrean perlu segera dikirim.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {needsWhatsapp ? (
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp penerima masukan</CardTitle>
            <CardDescription>
              Isi nomor pengelola toko yang akan menindaklanjuti masukan tamu.
            </CardDescription>
          </CardHeader>
          <form onSubmit={onSaveReview}>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="owner-whatsapp">Nomor WhatsApp</FieldLabel>
                <Input
                  disabled={busy}
                  id="owner-whatsapp"
                  inputMode="tel"
                  maxLength={32}
                  onChange={(event) => {
                    setOwnerWhatsapp(event.target.value)
                    setSaved(false)
                  }}
                  placeholder="08xxxxxxxxxx"
                  required
                  value={ownerWhatsapp}
                />
                <FieldDescription>
                  {detail.serviceTier === 'PRO'
                    ? 'Masukan dari form masuk antrean WhatsApp untuk dikirim ke nomor ini. Nomor tidak ditampilkan kepada tamu.'
                    : 'Tamu yang memilih jalur masukan akan membuka chat WhatsApp ke nomor ini.'}
                </FieldDescription>
              </Field>
            </CardContent>
            <CardFooter className="mt-5">
              <Button disabled={busy || !whatsappChanged} type="submit">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Simpan nomor WhatsApp
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : null}
    </div>
  )
}
