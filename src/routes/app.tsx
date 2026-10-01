import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '#/components/admin-shell'
import { can } from '#/lib/access'
import { getCurrentOwnerFn } from '#/server/functions'

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    if (can(owner.permissions, 'home.read')) throw redirect({ to: '/admin' })
    return { owner }
  },
  component: AppLayout,
})

function AppLayout() {
  const { owner } = Route.useRouteContext()
  return (
    <AdminShell user={owner}>
      <Outlet />
    </AdminShell>
  )
}
