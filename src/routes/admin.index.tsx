import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRightIcon, FactoryIcon, PrinterIcon } from 'lucide-react'
import { KitPreview } from '#/components/kit-preview'
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
import { formatDay } from '#/lib/utils'
import {
  getAppUrlInfoFn,
  getDashboardFn,
  listAffiliateLeadsFn,
  listStockBatchesFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/')({
  loader: async () => {
    const [summary, batches, affiliates, appUrl] = await Promise.all([
      getDashboardFn(),
      listStockBatchesFn(),
      listAffiliateLeadsFn({ data: { page: 1, pageSize: 6 } }),
      getAppUrlInfoFn(),
    ])
    return {
      summary,
      batches: batches.filter((batch) => batch.type !== 'NFC'),
      affiliates,
      appUrl,
    }
  },
  component: AdminHomePage,
  head: () => ({
    meta: [{ title: 'Admin — Ternak Review' }],
  }),
})

function AdminHomePage() {
  const { summary, batches, affiliates, appUrl } = Route.useLoaderData()
  const recentAffiliates = affiliates.leads
  const latest = batches[0]
  const chipLeft = latest
    ? Math.max(0, latest.remaining - latest.encoded)
    : 0
  const needsChip = Boolean(latest && chipLeft > 0)
  const recentStores = summary.recentStores

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
          {batches.length === 0 ? (
            <>
              Mulai <em className="text-pine italic">produksi</em>
            </>
          ) : (
            <>
              Mau <em className="text-pine italic">ngapain?</em>
            </>
          )}
        </h1>
        <p className="max-w-lg text-muted-foreground">
          Generate QR → cetak → tempel NFC → jual. Toko yang aktivasi. Tamu
          tempel HP atau scan QR, langsung ke Google Review.
        </p>
      </div>

      <AppUrlBanner info={appUrl} />

      {batches.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada produksi</EmptyTitle>
            <EmptyDescription>
              Bikin QR, cetak, tempel NFC, baru dijual. Tidak perlu akun untuk
              sales atau tamu.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="w-full max-w-xs">
              <KitPreview />
            </div>
            <Button asChild size="lg">
              <Link to="/admin/stock">Mulai produksi</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : latest ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {needsChip
                ? chipLeft === latest.remaining
                  ? 'Lanjut cetak'
                  : 'Lanjut tempel NFC'
                : 'Siap dijual'}
            </CardTitle>
            <CardDescription>{latest.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              {needsChip
                ? chipLeft === latest.remaining
                  ? `${latest.remaining} QR sudah jadi. Cetak kartu dulu, baru tempel NFC.`
                  : `${chipLeft} dari ${latest.remaining} kartu belum ditempel NFC. Jangan dijual dulu.`
                : `${latest.remaining} kartu sudah generate, cetak, dan NFC. Kirim ke toko — mereka yang aktivasi.`}
            </p>
          </CardContent>
          <CardFooter>
            {needsChip ? (
              chipLeft === latest.remaining ? (
                <Button asChild>
                  <Link
                    search={{ batch: latest.id }}
                    to="/admin/stock/print"
                  >
                    <PrinterIcon data-icon="inline-start" />
                    Cetak kartu
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link search={{ batch: latest.id }} to="/admin/stock/nfc">
                    Tempel NFC
                  </Link>
                </Button>
              )
            ) : (
              <Button asChild>
                <Link to="/admin/stock">
                  <FactoryIcon data-icon="inline-start" />
                  Produksi lagi
                </Link>
              </Button>
            )}
          </CardFooter>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium tracking-tight">Sekarang</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatLine
            label="Toko sudah pasang"
            to="/dashboard/units"
            search={{ status: 'ACTIVE' }}
            value={summary.activeCount}
          />
          <StatLine
            label="Kartu masih di gudang"
            to="/dashboard/units"
            search={{ status: 'IN_STOCK' }}
            value={summary.stockCount}
          />
          <StatLine
            label="Scan bulan ini"
            to="/dashboard/units"
            value={summary.clicksThisMonth}
          />
          <StatLine
            label="Daftar affiliate"
            to="/admin/affiliate"
            value={affiliates.total}
          />
        </div>
      </section>

      {recentAffiliates.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium tracking-tight">Affiliate terbaru</h2>
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
            <h2 className="font-medium tracking-tight">Toko terbaru</h2>
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
}: {
  label: string
  value: number
  to: '/dashboard/units' | '/admin/affiliate'
  search?: { status: 'IN_STOCK' | 'ACTIVE' | 'INACTIVE' }
}) {
  return (
    <Link className="block no-underline" search={search} to={to}>
      <Card className="h-full">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
