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
  const unpaired = search.state === 'unpaired'

  return (
    <AuthShell>
      <AuthTitle
        title={
          unpaired ? (
            <>
              Belum <em className="text-pine italic">siap</em>
            </>
          ) : inactive ? (
            <>
              Sedang <em className="text-pine italic">nonaktif</em>
            </>
          ) : (
            <>
              Tidak <em className="text-pine italic">ditemukan</em>
            </>
          )
        }
      />
      <Button asChild className="w-full" size="lg">
        <Link to="/">Beranda</Link>
      </Button>
    </AuthShell>
  )
}
