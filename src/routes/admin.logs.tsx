import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { DataTable, DataTableCell, DataTableHead } from '#/components/data-table'
import { ListPager } from '#/components/list-pager'
import { PageHeader } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Select } from '#/components/ui/input'
import { listOutboundLogsFn, retryFeedbackFn } from '#/server/functions'

const logsSearchSchema = z.object({
  channel: z.enum(['email', 'whatsapp']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})

export const Route = createFileRoute('/admin/logs')({
  validateSearch: logsSearchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1 })],
  },
  loaderDeps: ({ search }) => ({ channel: search.channel, page: search.page }),
  loader: ({ deps }) =>
    listOutboundLogsFn({
      data: { channel: deps.channel, page: deps.page ?? 1, pageSize: 30 },
    }),
  component: OutboundLogsPage,
  head: () => ({
    meta: [{ title: 'Log kiriman — Ternak Review' }],
  }),
})

function formatWhen(value: number) {
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function kindLabel(kind: string) {
  if (kind === 'OTP') return 'OTP'
  if (kind === 'WELCOME') return 'PIN'
  if (kind === 'TEST') return 'Tes'
  if (kind === 'FEEDBACK') return 'Feedback'
  if (kind === 'NOTICE') return 'Pemberitahuan'
  return kind
}

function statusBadge(status: string) {
  if (status === 'SENT' || status === 'DELIVERED') {
    return <Badge variant="success">{status === 'DELIVERED' ? 'Diterima' : 'Terkirim'}</Badge>
  }
  if (status === 'SUBMITTED') return <Badge variant="accent">Terkirim</Badge>
  if (status === 'QUEUED') return <Badge variant="secondary">Antre</Badge>
  if (status === 'PROCESSING') return <Badge variant="secondary">Diproses</Badge>
  if (status === 'FAILED') {
    return (
      <Badge className="border-destructive/30 text-destructive" variant="outline">
        Gagal
      </Badge>
    )
  }
  if (status === 'UNCERTAIN') return <Badge variant="muted">Tidak pasti</Badge>
  return <Badge variant="outline">{status}</Badge>
}

function OutboundLogsPage() {
  const initial = Route.useLoaderData()
  const { channel, page } = Route.useSearch()
  const navigate = useNavigate({ from: '/admin/logs' })
  const listFn = useServerFn(listOutboundLogsFn)
  const retryFn = useServerFn(retryFeedbackFn)
  const [data, setData] = useState(initial)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)

  useEffect(() => {
    setData(initial)
  }, [initial])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void listFn({
        data: { channel, page: page ?? 1, pageSize: 30 },
      }).then(setData)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [channel, listFn, page])

  const { items, total, pageCount, pageSize, summary } = data
  const currentPage = data.page

  function setChannel(next?: 'email' | 'whatsapp') {
    void navigate({
      search: { channel: next, page: undefined },
      replace: true,
    })
  }

  async function retry(feedbackId: string) {
    setRetryingId(feedbackId)
    setRetryError(null)
    try {
      const result = await retryFn({ data: { feedbackId } })
      if (!result.ok) throw new Error('Feedback tidak ditemukan.')
      const refreshed = await listFn({
        data: { channel, page: page ?? 1, pageSize: 30 },
      })
      setData(refreshed)
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Feedback gagal dimasukkan ke antrean.')
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="Jejak keluar: email (OTP, PIN, tes) dan WhatsApp (OTP, feedback kartu). Bukan inbox. Kode OTP/PIN disamarkan di daftar ini."
        title="Log kiriman"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              {summary.email.ready
                ? `Aktif · ${summary.email.provider === 'resend' ? 'Resend' : 'SMTP'}`
                : 'Belum aktif'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {summary.email.sent} terkirim · {summary.email.failed} gagal ·{' '}
            {summary.email.total} total
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>
              {summary.whatsapp.open
                ? 'Gateway nyala'
                : `Gateway ${summary.whatsapp.status}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {summary.whatsapp.queued} antre · {summary.whatsapp.failed} gagal ·{' '}
            {summary.whatsapp.total} total
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          onChange={(event) => {
            const value = event.target.value
            setChannel(value === 'email' || value === 'whatsapp' ? value : undefined)
          }}
          value={channel ?? 'all'}
        >
          <option value="all">Semua kanal</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </Select>
        <p className="text-sm text-muted-foreground">Diperbarui tiap 4 detik</p>
      </div>
      {retryError ? <Alert variant="danger">{retryError}</Alert> : null}
      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada kiriman</EmptyTitle>
            <EmptyDescription>
              Tes email di pengaturan Email, atau OTP/feedback WhatsApp akan muncul di sini.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DataTable>
            <DataTableHead
              columns={['Waktu', 'Kanal', 'Jenis', 'Tujuan', 'Isi', 'Status']}
            />
            <tbody>
              {items.map((item) => (
                <tr key={`${item.channel}-${item.id}`}>
                  <DataTableCell muted>{formatWhen(item.createdAt)}</DataTableCell>
                  <DataTableCell>
                    {item.channel === 'email' ? 'Email' : 'WhatsApp'}
                  </DataTableCell>
                  <DataTableCell>{kindLabel(item.kind)}</DataTableCell>
                  <DataTableCell mono>{item.to}</DataTableCell>
                  <DataTableCell>
                    <div className="max-w-md">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground">{item.preview}</p>
                      {item.error ? (
                        <p className="mt-1 text-destructive">{item.error}</p>
                      ) : null}
                      {item.channel === 'whatsapp' &&
                      item.kind === 'FEEDBACK' &&
                      (item.status === 'FAILED' || item.status === 'UNCERTAIN') ? (
                        <Button
                          className="mt-2"
                          disabled={retryingId === item.id}
                          onClick={() => void retry(item.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {retryingId === item.id ? 'Menyiapkan…' : 'Kirim ulang'}
                        </Button>
                      ) : null}
                    </div>
                  </DataTableCell>
                  <DataTableCell>{statusBadge(item.status)}</DataTableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ListPager
            onPage={(next) => {
              void navigate({
                search: { channel, page: next === 1 ? undefined : next },
                replace: true,
              })
            }}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
          />
        </>
      )}
    </div>
  )
}
