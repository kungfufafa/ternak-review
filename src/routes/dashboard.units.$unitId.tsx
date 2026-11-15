import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { MapPinIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import {
  GoogleMapsEmbed,
  mapsSearchUrl,
} from '#/components/google-maps-embed'
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
import { PlaceRatingLine } from '#/components/place-rating'
import { ReviewPathFields } from '#/components/review-path-fields'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input, Select } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { formatNumericDay } from '#/lib/utils'

import type { getUnitDetail } from '#/server/clicks'
import {
  assignUnitToHolderFn,
  deleteUnitFn,
  getUnitDetailFn,
  listAssignableHoldersFn,
  resetUnitFn,
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
  const resetUnit = useServerFn(resetUnitFn)
  const router = useRouter()
  const [partnerRef, setPartnerRef] = useState(detail.partnerRef ?? '')
  const [serviceTier, setServiceTier] = useState(detail.serviceTier)
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(detail.ownerWhatsapp ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggleOpen, setToggleOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [holderId, setHolderId] = useState(detail.holder?.id ?? '')
  const [holderBusy, setHolderBusy] = useState(false)
  const [holderConfirmOpen, setHolderConfirmOpen] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const nextHolder = holders.find((holder) => holder.id === holderId)
  const currentHolderId = detail.holder?.id ?? ''
  const holderDirty = holderId !== currentHolderId
  const willDeactivate = detail.status === 'ACTIVE'
  const inStock = detail.status === 'IN_STOCK'
  const canReset =
    detail.status !== 'IN_STOCK' ||
    Boolean(detail.holder) ||
    Boolean(detail.outlet) ||
    Boolean(detail.activatedAt) ||
    Boolean(detail.partnerRef)
  const holderSubmitLabel = !currentHolderId && holderId
    ? 'Tetapkan pemegang'
    : currentHolderId && !holderId
      ? 'Lepas pemegang'
      : currentHolderId && holderId && holderId !== currentHolderId
        ? 'Pindahkan pemegang'
        : 'Simpan pemegang'

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function flash(message: string) {
    setError(null)
    setNotice(message)
    window.requestAnimationFrame(() => {
      noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function fail(message: string) {
    setNotice(null)
    setError(message)
    window.requestAnimationFrame(() => {
      noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function onSaveHolder() {
    setHolderBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (!holderId) {
        await unassignHolder({ data: { unitId: detail.id } })
        flash('Pemegang dilepas.')
      } else {
        await assignHolder({
          data: { unitId: detail.id, ownerId: holderId },
        })
        flash(
          currentHolderId && currentHolderId !== holderId
            ? 'Pemegang dipindahkan.'
            : 'Pemegang ditetapkan.',
        )
      }
      setHolderConfirmOpen(false)
      await router.invalidate({ sync: true })
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Gagal mengatur pemegang.')
      setHolderConfirmOpen(false)
    } finally {
      setHolderBusy(false)
    }
  }

  async function onSavePartner(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await updatePartner({
        data: {
          unitId: detail.id,
          partnerRef: partnerRef.trim() || undefined,
        },
      })
      if (!result.ok) {
        fail(result.error)
        return
      }
      flash('Tag rekanan disimpan.')
      await router.invalidate()
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveReviewSettings(event: FormEvent) {
    event.preventDefault()
    setReviewBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await updateReviewSettings({
        data: {
          unitId: detail.id,
          serviceTier,
          ownerWhatsapp: ownerWhatsapp.trim() || undefined,
        },
      })
      if (!result.ok) {
        fail(result.error)
        return
      }
      setServiceTier(result.serviceTier)
      setOwnerWhatsapp(result.ownerWhatsapp ?? '')
      flash('Paket kartu disimpan.')
      await router.invalidate()
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Gagal menyimpan jalur review.')
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            {inStock ? (
              <Button asChild>
                <Link search={{ id: detail.publicId }} to="/activate">
                  Aktifkan ke toko
                </Link>
              </Button>
            ) : null}
            {detail.status === 'ACTIVE' || detail.status === 'INACTIVE' ? (
              <Button
                onClick={() => setToggleOpen(true)}
                type="button"
                variant="outline"
              >
                {willDeactivate ? 'Nonaktifkan' : 'Aktifkan kembali'}
              </Button>
            ) : null}
            {canReset ? (
              <Button
                onClick={() => setResetOpen(true)}
                type="button"
                variant="outline"
              >
                Reset ke gudang
              </Button>
            ) : null}
            {inStock && !detail.holder ? (
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
        description={headerDescription(detail)}
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
        <div className="flex flex-col gap-2 scroll-mt-24" ref={noticeRef}>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {notice ? <Alert variant="success">{notice}</Alert> : null}
        </div>
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
                {detail.outlet.baselineRating != null ||
                detail.outlet.baselineUserRatingCount != null ? (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">
                      Google Review saat kartu dipasang
                    </p>
                    <PlaceRatingLine
                      className="mt-1"
                      rating={detail.outlet.baselineRating}
                      userRatingCount={detail.outlet.baselineUserRatingCount}
                    />
                  </div>
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
                Belum terpasang ke toko
              </h2>
              <StatusBadge status={detail.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.nfcEncodedAt
                ? 'NFC sudah tertulis. Pilih listing Google Maps untuk mengaktifkan.'
                : 'NFC belum ditulis. Tulis chip-nya dulu, atau aktifkan lewat QR.'}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Cetakan</dt>
                <dd className="mt-0.5">{detail.batch?.label ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">NFC</dt>
                <dd className="mt-0.5">
                  {detail.nfcEncodedAt
                    ? `Tertulis ${formatNumericDay(detail.nfcEncodedAt)}`
                    : 'Belum ditulis'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pemegang</dt>
                <dd className="mt-0.5">
                  {detail.holder
                    ? (detail.holder.name ?? detail.holder.email)
                    : 'Belum ditetapkan'}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link search={{ id: detail.publicId }} to="/activate">
                  Aktifkan ke toko
                </Link>
              </Button>
              {!detail.nfcEncodedAt ? (
                <Button asChild variant="outline">
                  <Link
                    search={
                      detail.batch ? { batch: detail.batch.id } : undefined
                    }
                    to="/admin/stock/nfc"
                  >
                    Tulis NFC
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-card p-5">
          <p className="text-sm text-muted-foreground">Tautan kartu</p>
          <p className="mt-1 break-all font-mono text-sm">{detail.redirectUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={detail.redirectUrl}>
                {inStock ? 'Buka tautan aktivasi' : 'Coba sebagai tamu'}
              </a>
            </Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(detail.redirectUrl)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1500)
                } catch {
                  fail('Gagal menyalin URL.')
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
              Akun yang mengelola kartu dari aplikasi: statistik, masukan, dan
              toko.
            </CardDescription>
          </CardHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (detail.holder && holderId !== detail.holder.id) {
                setHolderConfirmOpen(true)
                return
              }
              void onSaveHolder()
            }}
          >
            <CardContent>
              <Field>
                <FieldLabel htmlFor="unit-holder">Akun pemegang</FieldLabel>
                {detail.holder ? (
                  <p className="mb-2 text-sm">
                    Sekarang:{' '}
                    {detail.holder.role === 'USER' ? (
                      <Link
                        className="text-pine underline underline-offset-4"
                        params={{ userId: detail.holder.id }}
                        to="/admin/users/$userId"
                      >
                        {detail.holder.name ?? detail.holder.email}
                      </Link>
                    ) : (
                      (detail.holder.name ?? detail.holder.email)
                    )}
                    {detail.holder.status === 'DISABLED'
                      ? ' · akun nonaktif'
                      : ''}
                  </p>
                ) : null}
                {holders.length === 0 && !detail.holder ? (
                  <p className="text-sm text-muted-foreground">
                    Belum ada akun pemegang.{' '}
                    <Link
                      className="text-pine underline underline-offset-4"
                      to="/admin/users"
                    >
                      Buat akun
                    </Link>
                    {' '}lalu kembali ke sini.
                  </p>
                ) : (
                  <Select
                    disabled={holderBusy}
                    id="unit-holder"
                    onChange={(event) => {
                      setHolderId(event.target.value)
                      setNotice(null)
                    }}
                    value={holderId}
                  >
                    <option value="">Tanpa pemegang</option>
                    {detail.holder &&
                    !holders.some((holder) => holder.id === detail.holder?.id) ? (
                      <option disabled value={detail.holder.id}>
                        {detail.holder.name ?? detail.holder.email} ·{' '}
                        {detail.holder.status === 'DISABLED'
                          ? 'akun nonaktif'
                          : 'pemegang saat ini'}
                      </option>
                    ) : null}
                    {holders.map((holder) => (
                      <option key={holder.id} value={holder.id}>
                        {holder.name
                          ? `${holder.name} · ${holder.email}`
                          : holder.email}
                      </option>
                    ))}
                  </Select>
                )}
                <FieldDescription>{holderHelp(detail)}</FieldDescription>
                {inStock && detail.holder ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Lepas pemegang dulu jika kartu ini harus dihapus dari
                    gudang.
                  </p>
                ) : null}
              </Field>
            </CardContent>
            {holderDirty ? (
              <CardFooter>
                <Button disabled={holderBusy} type="submit">
                  {holderBusy ? <Spinner data-icon="inline-start" /> : null}
                  {holderSubmitLabel}
                </Button>
              </CardFooter>
            ) : null}
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
              Jalur yang dilalui tamu setelah tempel atau scan. Nomor WhatsApp
              tindak lanjut ikut kartu, bukan pemegang.
            </CardDescription>
          </CardHeader>
          <form onSubmit={onSaveReviewSettings}>
            <CardContent className="flex flex-col gap-4">
              <ReviewPathFields
                onTierChange={(tier) => {
                  setServiceTier(tier)
                  setNotice(null)
                }}
                onWhatsappChange={(value) => {
                  setOwnerWhatsapp(value)
                  setNotice(null)
                }}
                ownerWhatsapp={ownerWhatsapp}
                packages={detail.servicePackages}
                serviceTier={serviceTier}
                viewerRole="ADMIN"
                whatsappGatewayOpen={detail.whatsappGatewayOpen}
              />
              <p className="text-sm text-muted-foreground">
                Nama paket dan batas bintang di{' '}
                <Link className="text-pine underline underline-offset-4" to="/admin/packages">
                  Pengaturan paket
                </Link>
                .
              </p>
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
        confirmLabel={holderId ? 'Pindahkan pemegang' : 'Lepas pemegang'}
        description={
          holderId
            ? `${detail.holder?.name ?? detail.holder?.email ?? 'Pemegang lama'} tidak lagi bisa kelola kartu ini. Akses pindah ke ${nextHolder ? (nextHolder.name ?? nextHolder.email) : 'akun baru'}. Toko dan paket tidak berubah.`
            : `${detail.holder?.name ?? detail.holder?.email ?? 'Pemegang'} tidak lagi bisa kelola kartu ini dari aplikasi. Tamu tetap bisa review jika kartu aktif.`
        }
        onConfirm={onSaveHolder}
        onOpenChange={(open) => {
          if (!holderBusy) setHolderConfirmOpen(open)
        }}
        open={holderConfirmOpen}
        pending={holderBusy}
        title={holderId ? 'Pindahkan kartu ke pemegang lain?' : 'Lepas pemegang kartu?'}
        variant={holderId ? 'default' : 'destructive'}
      />

      <ConfirmDelete
        confirmLabel={willDeactivate ? 'Nonaktifkan' : 'Aktifkan'}
        description={
          willDeactivate
            ? `Tamu yang tempel atau scan ${detail.publicId} tidak dapat melanjutkan ke jalur review sampai kartu diaktifkan lagi.`
            : `Tamu yang tempel atau scan ${detail.publicId} akan kembali mengikuti jalur review sesuai paket untuk ${detail.outlet?.name ?? 'toko ini'}.`
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
            flash(
              willDeactivate
                ? 'Kartu dinonaktifkan. Tamu tidak bisa review sampai diaktifkan lagi.'
                : 'Kartu aktif kembali.',
            )
            await router.invalidate()
          } catch (err) {
            fail(err instanceof Error ? err.message : 'Gagal mengubah status.')
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
        confirmLabel="Reset ke gudang"
        description={`${detail.publicId} kembali belum aktif, lepas dari toko dan pemegang. Kode QR/NFC tetap sama, bisa diaktifkan ke toko baru. Riwayat scan dan masukan dihapus.`}
        onConfirm={async () => {
          setResetting(true)
          setError(null)
          try {
            const result = await resetUnit({ data: { unitId: detail.id } })
            if (!result.ok) {
              fail(result.error)
              setResetOpen(false)
              return
            }
            setResetOpen(false)
            flash('Kartu direset ke gudang. Bisa diaktifkan ke toko baru.')
            await router.invalidate({ sync: true })
          } catch (err) {
            fail(err instanceof Error ? err.message : 'Gagal mereset kartu.')
            setResetOpen(false)
          } finally {
            setResetting(false)
          }
        }}
        onOpenChange={(open) => {
          if (!resetting) setResetOpen(open)
        }}
        open={resetOpen}
        pending={resetting}
        title="Reset kartu ke gudang?"
      />

      <ConfirmDelete
        description={`${detail.publicId} akan dihapus dari gudang. Kartu yang sudah dialokasikan atau dipakai toko tidak bisa dihapus.`}
        onConfirm={async () => {
          setDeleting(true)
          try {
            const result = await removeUnit({ data: { unitId: detail.id } })
            if (!result.ok) {
              fail(result.error)
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
    </div>
  )
}

function headerDescription(detail: UnitDetail) {
  const scans = `${detail.totalClicks} scan`
  const partner = detail.partnerRef ? ` · ${detail.partnerRef}` : ''
  if (detail.status === 'IN_STOCK') {
    const nfc = detail.nfcEncodedAt ? 'NFC siap' : 'NFC belum ditulis'
    return `Belum terpasang ke toko · ${nfc} · ${scans}${partner}`
  }
  if (detail.status === 'INACTIVE') {
    return `Nonaktif · tamu tidak bisa review · ${scans}${partner}`
  }
  return `Tempel atau scan · ${scans}${partner}`
}

function holderHelp(detail: UnitDetail) {
  if (detail.holder) {
    return detail.status === 'IN_STOCK'
      ? 'Pemegang yang sudah masuk dapat mengaktifkan tanpa PIN. Tautan publik memakai PIN akun ini.'
      : 'Pemegang melihat statistik, masukan, dan dapat mengganti toko.'
  }
  if (detail.status === 'IN_STOCK') {
    return 'Boleh ditetapkan sekarang atau nanti. Tanpa pemegang, tautan publik bisa mengaktifkan toko langsung.'
  }
  return 'Toko sudah aktif. Tetapkan akun agar ada yang mengelola kartu dari aplikasi.'
}
