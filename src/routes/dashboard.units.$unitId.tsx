import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { MapPinIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import {
  GoogleMapsEmbed,
  mapsSearchUrl,
} from '#/components/google-maps-embed'
import { PageHeader } from '#/components/page'
import { Sparkline } from '#/components/Sparkline'
import { StatusBadge } from '#/components/ui/badge'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input, Select } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'

import type { getUnitDetail } from '#/server/clicks'
import {
  assignUnitToHolderFn,
  deleteUnitFn,
  getUnitDetailFn,
  listAssignableHoldersFn,
  retryFeedbackFn,
  toggleUnitFn,
  unassignUnitFn,
  updateUnitPartnerFn,
  updateUnitReviewSettingsFn,
} from '#/server/functions'

type UnitDetail = NonNullable<Awaited<ReturnType<typeof getUnitDetail>>>

export const Route = createFileRoute('/dashboard/units/$unitId')({
  loader: async ({ params }) => {
    const [detail, holders] = await Promise.all([
      getUnitDetailFn({ data: { unitId: params.unitId } }),
      listAssignableHoldersFn(),
    ])
    if (!detail) throw notFound()
    return { detail, holders }
  },
  component: UnitDetailPage,
  head: () => ({
    meta: [{ title: 'Kartu — Ternak Review' }],
  }),
})

function UnitDetailPage() {
  const { detail, holders } = Route.useLoaderData()
  return <UnitDetailEditor holders={holders} key={detail.id} detail={detail} />
}

function UnitDetailEditor({
  detail,
  holders,
}: {
  detail: UnitDetail
  holders: Awaited<ReturnType<typeof listAssignableHoldersFn>>
}) {
  const toggle = useServerFn(toggleUnitFn)
  const updatePartner = useServerFn(updateUnitPartnerFn)
  const updateReviewSettings = useServerFn(updateUnitReviewSettingsFn)
  const assignHolder = useServerFn(assignUnitToHolderFn)
  const unassignHolder = useServerFn(unassignUnitFn)
  const retryFeedback = useServerFn(retryFeedbackFn)
  const removeUnit = useServerFn(deleteUnitFn)
  const router = useRouter()
  const [partnerRef, setPartnerRef] = useState(detail.partnerRef ?? '')
  const [serviceTier, setServiceTier] = useState(detail.serviceTier)
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(detail.ownerWhatsapp ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggleOpen, setToggleOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [holderId, setHolderId] = useState(detail.holder?.id ?? '')
  const [holderBusy, setHolderBusy] = useState(false)
  const willDeactivate = detail.status === 'ACTIVE'

  async function onSavePartner(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const result = await updatePartner({
        data: {
          unitId: detail.id,
          partnerRef: partnerRef.trim() || undefined,
        },
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveReviewSettings(event: FormEvent) {
    event.preventDefault()
    setReviewBusy(true)
    setError(null)
    setSaved(false)
    try {
      const result = await updateReviewSettings({
        data: {
          unitId: detail.id,
          serviceTier,
          ownerWhatsapp: ownerWhatsapp.trim() || undefined,
        },
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setServiceTier(result.serviceTier)
      setOwnerWhatsapp(result.ownerWhatsapp ?? '')
      setSaved(true)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan jalur review.')
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            {detail.status === 'ACTIVE' || detail.status === 'INACTIVE' ? (
              <Button
                onClick={() => setToggleOpen(true)}
                type="button"
                variant="outline"
              >
                {willDeactivate ? 'Nonaktifkan' : 'Aktifkan kembali'}
              </Button>
            ) : null}
            {detail.status === 'IN_STOCK' ? (
              <Button
                onClick={() => setConfirmOpen(true)}
                type="button"
                variant="destructive"
              >
                Hapus
              </Button>
            ) : null}
          </div>
        }
        description={`Tempel atau scan · ${detail.totalClicks} kali${detail.partnerRef ? ` · ${detail.partnerRef}` : ''}`}
        title={detail.publicId}
      />

      <div className="mb-4">
        <Link
          className="text-sm text-muted-foreground hover:text-foreground"
          to="/dashboard/units"
        >
          ← Semua kartu
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {detail.outlet ? (
          <div className="overflow-hidden rounded-2xl bg-card">
            <GoogleMapsEmbed
              address={detail.outlet.address}
              name={detail.outlet.name}
            />
            <div className="flex flex-col gap-4 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-medium tracking-tight">
                    {detail.outlet.name}
                  </h2>
                  <StatusBadge status={detail.status} />
                </div>
                {detail.outlet.address ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.outlet.address}
                  </p>
                ) : null}
                {detail.batch ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cetakan: {detail.batch.label}
                  </p>
                ) : null}
              </div>
              <Button asChild className="w-fit" variant="outline">
                <a
                  href={mapsSearchUrl({
                    name: detail.outlet.name,
                    address: detail.outlet.address,
                    placeId: detail.outlet.googlePlaceId,
                  })}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MapPinIcon data-icon="inline-start" />
                  Buka di Google Maps
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium tracking-tight">
                Belum diaktivasi
              </h2>
              <StatusBadge status={detail.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Kartu masih di stok. Scan QR atau tempel NFC, lalu pilih toko di
              Google Maps.
            </p>
            {detail.batch ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Cetakan: {detail.batch.label}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-muted-foreground">
              NFC:{' '}
              {detail.nfcEncodedAt
                ? `tertulis ${new Date(detail.nfcEncodedAt).toLocaleDateString('id-ID')}`
                : 'belum ditulis'}
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-card p-5">
          <p className="text-sm text-muted-foreground">Tautan kartu</p>
          <p className="mt-1 break-all font-mono text-sm">{detail.redirectUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={detail.redirectUrl}>{detail.publicId}</a>
            </Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(detail.redirectUrl)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1500)
                } catch {
                  setError('Gagal menyalin URL.')
                }
              }}
              size="sm"
              type="button"
            >
              {copied ? 'URL tersalin' : 'Salin URL'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pemegang</CardTitle>
            <CardDescription>
              User yang memegang kartu ini. PIN aktivasi publik memakai PIN
              akun tersebut.
            </CardDescription>
          </CardHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setHolderBusy(true)
              setError(null)
              setSaved(false)
              void (async () => {
                try {
                  if (!holderId) {
                    await unassignHolder({ data: { unitId: detail.id } })
                  } else {
                    await assignHolder({
                      data: { unitId: detail.id, ownerId: holderId },
                    })
                  }
                  setSaved(true)
                  await router.invalidate({ sync: true })
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : 'Gagal mengatur pemegang.',
                  )
                } finally {
                  setHolderBusy(false)
                }
              })()
            }}
          >
            <CardContent>
              <Field>
                <FieldLabel htmlFor="unit-holder">Akun pemegang</FieldLabel>
                <Select
                  id="unit-holder"
                  onChange={(event) => setHolderId(event.target.value)}
                  value={holderId}
                >
                  <option value="">Belum di-assign</option>
                  {holders.map((holder) => (
                    <option key={holder.id} value={holder.id}>
                      {holder.name ? `${holder.name} · ${holder.email}` : holder.email}
                    </option>
                  ))}
                </Select>
                <FieldDescription>
                  {detail.holder
                    ? `Sekarang: ${detail.holder.name ?? detail.holder.email}`
                    : 'Kartu tanpa pemegang tidak bisa diaktivasi lewat scan publik.'}
                </FieldDescription>
              </Field>
            </CardContent>
            <CardFooter>
              <Button disabled={holderBusy} type="submit">
                {holderBusy ? <Spinner data-icon="inline-start" /> : null}
                Simpan pemegang
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rekanan</CardTitle>
            <CardDescription>
              Tag sales/affiliate untuk kartu ini. Boleh dikosongkan.
            </CardDescription>
          </CardHeader>
          <form onSubmit={onSavePartner}>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="unit-partner">Tag rekanan</FieldLabel>
                  <Input
                    id="unit-partner"
                    maxLength={80}
                    onChange={(event) => setPartnerRef(event.target.value)}
                    placeholder="Contoh: aff-andi"
                    value={partnerRef}
                  />
                  <FieldDescription>
                    Dipakai untuk filter di daftar kartu.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {error ? (
                <p className="mt-3 text-sm text-destructive">{error}</p>
              ) : null}
              {saved ? (
                <p className="mt-3 text-sm text-success">Perubahan disimpan.</p>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button disabled={busy} type="submit">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paket kartu</CardTitle>
            <CardDescription>
              Tamu hanya nulis review. Nomor owner untuk tindak lanjut Plus/Pro.
            </CardDescription>
          </CardHeader>
          <form onSubmit={onSaveReviewSettings}>
            <CardContent className="flex flex-col gap-4">
              <ReviewPathFields
                onTierChange={(tier) => {
                  setServiceTier(tier)
                  setSaved(false)
                }}
                onWhatsappChange={(value) => {
                  setOwnerWhatsapp(value)
                  setSaved(false)
                }}
                ownerWhatsapp={ownerWhatsapp}
                packages={detail.servicePackages}
                serviceTier={serviceTier}
                whatsappGatewayOpen={detail.whatsappGatewayOpen}
              />
              <p className="text-sm text-muted-foreground">
                Nama paket dan batas bintang di{' '}
                <Link className="text-pine underline underline-offset-4" to="/admin/packages">
                  Pengaturan paket
                </Link>
                .
              </p>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              {saved ? (
                <p className="text-sm text-success">Perubahan disimpan.</p>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button disabled={reviewBusy} type="submit">
                {reviewBusy ? <Spinner data-icon="inline-start" /> : null}
                {reviewBusy ? 'Menyimpan…' : 'Simpan paket'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Masukan anonim</CardTitle>
            <CardDescription>
              Pesan tidak menyimpan nama atau nomor tamu. Status menunjukkan
              proses antrean WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {detail.feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada masukan.</p>
            ) : (
              detail.feedback.map((item) => (
                <div className="rounded-xl border border-border p-3" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">Rating {item.rating}/5</span>
                    <span className="text-muted-foreground">{item.status}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>
                  {item.deliveryError ? (
                    <p className="mt-2 text-xs text-destructive">{item.deliveryError}</p>
                  ) : null}
                  {item.status === 'FAILED' || item.status === 'UNCERTAIN' ? (
                    <Button
                      className="mt-3"
                      onClick={async () => {
                        await retryFeedback({ data: { feedbackId: item.id } })
                        await router.invalidate()
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Coba kirim lagi
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="rounded-2xl bg-card p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            Scan 30 hari terakhir
          </p>
          <Sparkline className="h-36" data={detail.daily} />
        </div>
      </div>

      <ConfirmDelete
        confirmLabel={willDeactivate ? 'Nonaktifkan' : 'Aktifkan'}
        description={
          willDeactivate
            ? `Tamu yang tempel atau scan ${detail.publicId} tidak akan ke Google Review sampai diaktifkan lagi.`
            : `Tamu yang tempel atau scan ${detail.publicId} akan ke Google Review ${detail.outlet?.name ?? 'toko ini'} lagi.`
        }
        onConfirm={async () => {
          setToggling(true)
          setError(null)
          try {
            await toggle({
              data: {
                unitId: detail.id,
                active: !willDeactivate,
              },
            })
            setToggleOpen(false)
            await router.invalidate()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal mengubah status.')
            setToggleOpen(false)
          } finally {
            setToggling(false)
          }
        }}
        onOpenChange={(open) => {
          if (!open && !toggling) setToggleOpen(false)
        }}
        open={toggleOpen}
        pending={toggling}
        title={willDeactivate ? 'Nonaktifkan kartu?' : 'Aktifkan lagi?'}
        variant={willDeactivate ? 'destructive' : 'default'}
      />

      <ConfirmDelete
        description={`${detail.publicId} akan dihapus dari gudang. Kartu yang sudah di toko tidak bisa dihapus.`}
        onConfirm={async () => {
          setDeleting(true)
          try {
            const result = await removeUnit({ data: { unitId: detail.id } })
            if (!result.ok) {
              setError(result.error)
              setConfirmOpen(false)
              return
            }
            setConfirmOpen(false)
            await router.navigate({ to: '/dashboard/units' })
          } finally {
            setDeleting(false)
          }
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={deleting}
        title="Hapus kartu gudang?"
      />
    </>
  )
}
