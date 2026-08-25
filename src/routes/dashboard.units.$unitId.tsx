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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  deleteUnitFn,
  getUnitDetailFn,
  toggleUnitFn,
  updateUnitPartnerFn,
} from '#/server/functions'

export const Route = createFileRoute('/dashboard/units/$unitId')({
  loader: async ({ params }) => {
    const detail = await getUnitDetailFn({ data: { unitId: params.unitId } })
    if (!detail) throw notFound()
    return { detail }
  },
  component: UnitDetailPage,
  head: () => ({
    meta: [{ title: 'Kartu — Ternak Review' }],
  }),
})

function UnitDetailPage() {
  const { detail } = Route.useLoaderData()
  return <UnitDetailEditor key={detail.id} detail={detail} />
}

function UnitDetailEditor({
  detail,
}: {
  detail: {
    id: string
    publicId: string
    status: string
    partnerRef: string | null
    totalClicks: number
    redirectUrl: string
    nfcEncodedAt: number | null
    batch: { id: string; label: string } | null
    daily: Array<{ date: string; count: number }>
    outlet: {
      name: string
      address: string | null
      photoUrl: string | null
      googlePlaceId: string
    } | null
  }
}) {
  const toggle = useServerFn(toggleUnitFn)
  const updatePartner = useServerFn(updateUnitPartnerFn)
  const removeUnit = useServerFn(deleteUnitFn)
  const router = useRouter()
  const [partnerRef, setPartnerRef] = useState(detail.partnerRef ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggleOpen, setToggleOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
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
