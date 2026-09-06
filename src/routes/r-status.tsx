import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/r-status')({
  validateSearch: (search: Record<string, unknown>): {
    state?: string
    id?: string
  } => ({
    state: typeof search.state === 'string' ? search.state : undefined,
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: StatusPage,
  head: () => ({
    meta: [{ title: 'Status — Ternak Review' }],
  }),
})

function StatusPage() {
  const search = Route.useSearch()
  const inactive = search.state === 'inactive'

  return (
    <AuthShell>
      <AuthTitle
        title={
          inactive ? (
            <>
              Kartu <em className="text-pine italic">nonaktif</em>
            </>
          ) : (
            <>
              Kartu tidak <em className="text-pine italic">ketemu</em>
            </>
          )
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {inactive
          ? 'Kartu ini belum bisa digunakan untuk review. Pemegang kartu dapat menghubungi admin untuk mengaktifkannya kembali.'
          : 'Coba tempel atau scan kartunya sekali lagi. Kalau masih sama, hubungi penjual.'}
      </p>
      <Button asChild className="w-full" size="lg">
        <Link to={inactive ? '/login' : '/'}>
          {inactive ? 'Masuk dashboard' : 'Beranda'}
        </Link>
      </Button>
    </AuthShell>
  )
}
