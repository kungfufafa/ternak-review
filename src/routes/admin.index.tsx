import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ChevronRightIcon, PrinterIcon } from 'lucide-react'
import { KitPreview } from '#/components/kit-preview'
import { Sparkline } from '#/components/Sparkline'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '#/components/ui/item'
import { AppUrlBanner } from '#/components/app-url-banner'
import { can } from '#/lib/access'
import { formatDay } from '#/lib/utils'
import {
  getAppUrlInfoFn,
  getCardDesignFn,
  getDashboardFn,
  listAffiliateLeadsFn,
  listStockBatchesFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/')({
  loader: async () => {
    const [summary, batches, affiliates, appUrl, cardDesign] =
      await Promise.all([
        getDashboardFn(),
        listStockBatchesFn(),
        listAffiliateLeadsFn({ data: { page: 1, pageSize: 6 } }),
        getAppUrlInfoFn(),
        getCardDesignFn(),
      ])
    return {
      summary,
      batches,
      affiliates,
      appUrl,
      cardDesign,
    }
  },
  component: AdminHomePage,
  head: () => ({
    meta: [{ title: 'Admin — Ternak Review' }],
  }),
})

function AdminHomePage() {
  const { summary, batches, affiliates, appUrl, cardDesign } =
    Route.useLoaderData()
  const { owner } = useRouteContext({ from: '/admin' })
  const canHandoff = can(owner.permissions, 'holders.manage')
  const recentAffiliates = affiliates.leads
  const pendingBatches = batches.filter(
    (batch) => batch.remaining > 0 && batch.next !== 'ready',
  )
  const focusBatch =
    pendingBatches.at(-1) ??
    batches.find((batch) => batch.readyStock > 0) ??
    batches.find((batch) => batch.assigned > 0) ??
    batches.find((batch) => batch.remaining > 0)
  const chipLeft = focusBatch
    ? Math.max(0, focusBatch.remaining - focusBatch.encoded)
    : 0
  const needsChip = Boolean(focusBatch && focusBatch.next !== 'ready')
  const recentStores = summary.recentStores
  const attentionCount =
    (pendingBatches.length > 0 ? 1 : 0) +
    (summary.readyStockCount < 25 ? 1 : 0) +
    (summary.assignedStockCount > 0 ? 1 : 0) +
    (summary.inactiveCount > 0 ? 1 : 0)

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium capitalize text-muted-foreground">
            {formatDashboardDay(summary.generatedAt)} · WIB
          </p>
          <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
            Operasional <em className="text-pine italic">hari ini</em>
          </h1>
          <p className="max-w-xl text-muted-foreground">
            Pantau produksi, stok, aktivasi toko, dan scan kartu dari satu
            tempat.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard/units">Lihat semua kartu</Link>
        </Button>
      </div>

      <AppUrlBanner info={appUrl} />

      {!focusBatch ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada kartu produksi</EmptyTitle>
            <EmptyDescription>
              Buat QR, cetak kartu, lalu tulis NFC. Tetapkan pemegang, atau
              aktifkan tokonya dulu lalu hubungkan akun kemudian.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="w-full max-w-xs">
              <KitPreview design={cardDesign} />
            </div>
            <Button asChild size="lg">
              <Link to="/admin/stock">Mulai produksi</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : focusBatch ? (
        <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <Card className="ring-1 ring-border">
            <CardHeader>
              <CardDescription>Fokus berikutnya</CardDescription>
              <CardTitle className="text-2xl">
                {needsChip
                  ? focusBatch.next === 'print'
                    ? 'Cetak & siapkan NFC'
                    : 'Selesaikan NFC'
                  : focusBatch.available > 0
                    ? canHandoff
                      ? 'Serahkan kartu'
                      : 'Tentukan pemegang kartu'
                    : focusBatch.assigned > 0
                      ? 'Pantau aktivasi pemegang'
                      : 'Produksi selesai'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="max-w-xl text-muted-foreground">
                {needsChip
                  ? focusBatch.next === 'print'
                    ? `NFC untuk ${focusBatch.remaining} kartu di ${focusBatch.label} belum tercatat. Cetak bila belum, lalu tulis NFC.`
                    : `${chipLeft} dari ${focusBatch.remaining} kartu di ${focusBatch.label} masih perlu ditulis ke NFC.`
                  : focusBatch.available > 0
                    ? `${focusBatch.readyStock} kartu di ${focusBatch.label} sudah tertulis NFC dan belum dialokasikan. Pilih pemegang, lalu serahkan kartu untuk aktivasi toko.`
                    : focusBatch.assigned > 0
                      ? `${focusBatch.assigned} kartu di ${focusBatch.label} sudah memiliki pemegang dan menunggu aktivasi toko.`
                      : `${focusBatch.label}: ${focusBatch.active} kartu aktif dan ${focusBatch.inactive} nonaktif. Tidak ada stok yang belum dialokasikan dari cetakan ini.`}
              </p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              {needsChip ? (
                focusBatch.next === 'print' ? (
                  <Button asChild>
                    <Link
                      search={{ batch: focusBatch.id }}
                      to="/admin/stock/print"
                    >
                      <PrinterIcon data-icon="inline-start" />
                      Lanjut cetak
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link
                      search={{ batch: focusBatch.id }}
                      to="/admin/stock/nfc"
                    >
                      Tempel NFC
                    </Link>
                  </Button>
                )
              ) : canHandoff && focusBatch.available > 0 ? (
                <Button asChild>
                  <Link to="/admin/users/serah">Serahkan kartu</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link
                    to="/dashboard/units"
                    search={{
                      batch: focusBatch.id,
                      status: focusBatch.inStock > 0 ? 'IN_STOCK' : undefined,
                      ownership:
                        focusBatch.available > 0 ? 'unassigned' : undefined,
                    }}
                  >
                    {focusBatch.available > 0
                      ? 'Atur pemegang kartu'
                      : 'Kelola kartu'}
                  </Link>
                </Button>
              )}
              {focusBatch.next === 'print' ? (
                <Button asChild variant="outline">
                  <Link search={{ batch: focusBatch.id }} to="/admin/stock/nfc">
                    Sudah cetak, lanjut NFC
                  </Link>
                </Button>
              ) : null}
            </CardFooter>
          </Card>

          <Card className="ring-1 ring-border">
            <CardHeader>
              <CardDescription>Perlu perhatian</CardDescription>
              <CardTitle>
                {attentionCount === 0
                  ? 'Semua rapi'
                  : `${attentionCount} hal untuk dicek`}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {pendingBatches.length > 0 ? (
                <AttentionLink to="/admin/stock">
                  {pendingBatches.length} cetakan masih perlu NFC
                </AttentionLink>
              ) : null}
              {summary.readyStockCount < 25 ? (
                <AttentionLink to="/admin/stock">
                  {summary.readyStockCount} kartu tertulis NFC belum dialokasikan
                </AttentionLink>
              ) : null}
              {summary.assignedStockCount > 0 ? (
                <AttentionLink
                  search={{ status: 'IN_STOCK', ownership: 'assigned' }}
                  to="/dashboard/units"
                >
                  {summary.assignedStockCount} kartu menunggu aktivasi pemegang
                </AttentionLink>
              ) : null}
              {summary.inactiveCount > 0 ? (
                <AttentionLink
                  search={{ status: 'INACTIVE' }}
                  to="/dashboard/units"
                >
                  {summary.inactiveCount} kartu sedang dimatikan
                </AttentionLink>
              ) : null}
              {attentionCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada antrean NFC, aktivasi tertunda, stok rendah,
                  atau kartu nonaktif.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-medium tracking-tight">Ringkasan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan berarti kartu berhasil dibuka. Sebagian kartu bisa membuka
              feedback sebelum tamu memilih Google Review.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatLine
            detail={`${summary.clicksLast7Days} dalam 7 hari penuh terakhir`}
            label="Kunjungan hari ini"
            to="/dashboard/units"
            value={summary.clicksToday}
          />
          <StatLine
            detail={trendLabel(
              summary.clicksLast7Days,
              summary.clicksPrevious7Days,
            )}
            label="7 hari penuh terakhir"
            to="/dashboard/units"
            value={summary.clicksLast7Days}
          />
          <StatLine
            detail={`${summary.activeCount} kartu aktif`}
            label="Toko aktif"
            to="/dashboard/units"
            search={{ status: 'ACTIVE' }}
            value={summary.activeOutletCount}
          />
          <StatLine
            detail={`${summary.readyStockCount} sudah tertulis NFC`}
            label="Belum dialokasikan"
            to="/dashboard/units"
            search={{ status: 'IN_STOCK', ownership: 'unassigned' }}
            value={summary.availableStockCount}
          />
          <StatLine
            detail="Sudah memiliki akun pemegang"
            label="Menunggu aktivasi"
            to="/dashboard/units"
            search={{ status: 'IN_STOCK', ownership: 'assigned' }}
            value={summary.assignedStockCount}
          />
          <StatLine
            detail="Periksa sebelum mengaktifkan kembali"
            label="Kartu nonaktif"
            to="/dashboard/units"
            search={{ status: 'INACTIVE' }}
            value={summary.inactiveCount}
          />
        </div>
      </section>

      <Card className="ring-1 ring-border">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Kunjungan 14 hari</CardTitle>
            <CardDescription>
              {summary.clicksThisMonth} kunjungan bulan ini · waktu WIB
            </CardDescription>
          </div>
          <p className="text-2xl font-semibold tabular-nums">
            {summary.daily.reduce((total, day) => total + day.count, 0)}
          </p>
        </CardHeader>
        <CardContent>
          <Sparkline
            className="h-44"
            data={summary.daily}
            label="Grafik scan kartu selama 14 hari terakhir"
          />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>{formatShortDay(summary.daily[0]?.date)}</span>
            <span>{formatShortDay(summary.daily.at(-1)?.date)}</span>
          </div>
        </CardContent>
      </Card>

      {recentAffiliates.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium tracking-tight">Affiliate terbaru</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {affiliates.total} pendaftar tersimpan
              </p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin/affiliate">Lihat semua</Link>
            </Button>
          </div>
          <ItemGroup className="overflow-hidden rounded-2xl bg-card">
            {recentAffiliates.map((lead) => (
              <Item asChild key={lead.id} size="sm">
                <Link params={{ leadId: lead.id }} to="/admin/affiliate/$leadId">
                  <ItemContent>
                    <ItemTitle>{lead.nama}</ItemTitle>
                    <ItemDescription>
                      {formatDay(lead.createdAt)} · {lead.whatsapp}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRightIcon />
                  </ItemActions>
                </Link>
              </Item>
            ))}
          </ItemGroup>
        </section>
      ) : null}

      {recentStores.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium tracking-tight">Aktivasi terbaru</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/dashboard/units">Lihat semua</Link>
            </Button>
          </div>
          <ItemGroup className="overflow-hidden rounded-2xl bg-card">
            {recentStores.map((unit) => (
              <Item asChild key={unit.id} size="sm">
                <Link
                  params={{ unitId: unit.id }}
                  to="/dashboard/units/$unitId"
                >
                  <ItemContent>
                    <ItemTitle>{unit.outletName}</ItemTitle>
                    <ItemDescription>
                      {unit.activatedAt
                        ? formatDay(unit.activatedAt)
                        : unit.publicId}
                      {unit.partnerRef ? ` · ${unit.partnerRef}` : ''}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRightIcon />
                  </ItemActions>
                </Link>
              </Item>
            ))}
          </ItemGroup>
        </section>
      ) : null}
    </div>
  )
}

function StatLine({
  label,
  value,
  to,
  search,
  detail,
}: {
  label: string
  value: number
  to: '/dashboard/units' | '/admin/affiliate'
  search?: {
    status: 'IN_STOCK' | 'ACTIVE' | 'INACTIVE'
    ownership?: 'unassigned' | 'assigned'
  }
  detail?: string
}) {
  return (
    <Link className="block no-underline" search={search} to={to}>
      <Card className="h-full ring-1 ring-border transition-colors hover:bg-accent/40">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          {detail ? (
            <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

function AttentionLink({
  children,
  to,
  search,
}: {
  children: React.ReactNode
  to: '/admin/stock' | '/dashboard/units'
  search?: {
    status: 'IN_STOCK' | 'ACTIVE' | 'INACTIVE'
    ownership?: 'unassigned' | 'assigned'
  }
}) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 text-sm transition-colors hover:bg-accent"
      search={search}
      to={to}
    >
      <span>{children}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

function formatDashboardDay(value: number) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value))
}

function formatShortDay(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T12:00:00+07:00`))
}

function trendLabel(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 'Belum ada kunjungan' : 'Mulai ada aktivitas'
  }
  const delta = Math.round(((current - previous) / previous) * 100)
  if (delta === 0) return 'Sama dengan 7 hari sebelumnya'
  return `${delta > 0 ? 'Naik' : 'Turun'} ${Math.abs(delta)}% dari 7 hari sebelumnya`
}
