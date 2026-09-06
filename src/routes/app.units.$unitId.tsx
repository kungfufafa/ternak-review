import { createFileRoute, Link, notFound, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { PlacePicker } from '#/components/place-picker'
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
import { ReviewPathFields } from '#/components/review-path-fields'
import { Spinner } from '#/components/ui/spinner'
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
  } | null>(null)
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(detail.ownerWhatsapp ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const servicePackage =
    detail.servicePackages.find((item) => item.serviceTier === detail.serviceTier) ??
    detail.servicePackages[0]

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
      setPendingPlace({ placeId: details.placeId, name: details.name })
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

      {detail.outlet ? (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <p className="font-medium">{detail.outlet.name}</p>
          {detail.outlet.address ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.outlet.address}
            </p>
          ) : null}
          <Button
            className="mt-3"
            onClick={() => {
              setChangingPlace((open) => !open)
              setPendingPlace(null)
              setSessionToken(crypto.randomUUID())
            }}
            type="button"
            variant="outline"
          >
            {changingPlace ? 'Batal' : 'Toko salah? Ganti'}
          </Button>
          {changingPlace ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Pilih listing yang benar. Tamu berikutnya akan ke toko baru.
                Scan lama tidak terhapus.
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
                <Button disabled={busy} onClick={() => void onRebind()} type="button">
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  Pasang ke {pendingPlace.name}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl bg-card p-5">
            <p className="text-sm text-muted-foreground">Scan</p>
            <p className="mt-1 text-2xl font-medium tabular-nums">
              {detail.totalClicks}
            </p>
            <div className="mt-4">
              <Sparkline data={detail.daily} />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Tindak lanjut</CardTitle>
              <CardDescription>
                Tamu hanya nulis review. Nomor owner untuk Plus/Pro.
              </CardDescription>
            </CardHeader>
            <form onSubmit={onSaveReview}>
              <CardContent className="flex flex-col gap-4">
                <ReviewPathFields
                  allowTierChange={false}
                  onTierChange={() => {}}
                  onWhatsappChange={setOwnerWhatsapp}
                  ownerWhatsapp={ownerWhatsapp}
                  packages={detail.servicePackages}
                  serviceTier={detail.serviceTier}
                  whatsappGatewayOpen={detail.whatsappGatewayOpen}
                />
              </CardContent>
              <CardFooter className="mt-5">
                <Button disabled={busy} type="submit">
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  Simpan jalur review
                </Button>
              </CardFooter>
            </form>
          </Card>
    </div>
  )
}
