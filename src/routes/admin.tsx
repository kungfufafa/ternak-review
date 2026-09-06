import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '#/components/admin-shell'
import { getCurrentOwnerFn } from '#/server/functions'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    if (owner.role !== 'ADMIN') throw redirect({ to: '/app' })
    return { owner }
  },
  component: AdminLayout,
})

function AdminLayout() {
  const { owner } = Route.useRouteContext()
  return (
    <AdminShell user={owner}>
      <Outlet />
    </AdminShell>
  )
}
