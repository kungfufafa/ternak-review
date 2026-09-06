import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '#/components/admin-shell'
import { getCurrentOwnerFn } from '#/server/functions'

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    if (owner.role !== 'USER') throw redirect({ to: '/admin' })
    return { owner }
  },
  component: AppLayout,
})

function AppLayout() {
  const { owner } = Route.useRouteContext()
  return (
    <AdminShell email={owner.email}>
      <Outlet />
    </AdminShell>
  )
}
