import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '#/components/admin-shell'
import { canAccessPath, homePath } from '#/lib/access'
import { getCurrentOwnerFn } from '#/server/functions'

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ location }) => {
    const owner = await getCurrentOwnerFn()
    if (!owner) throw redirect({ to: '/login' })
    if (!canAccessPath(owner.permissions, location.pathname)) {
      throw redirect({ to: homePath(owner.permissions) })
    }
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
