import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth-page'
import { adminExistsFn, getCurrentOwnerFn } from '#/server/functions'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const owner = await getCurrentOwnerFn()
    if (owner) throw redirect({ to: '/admin' })
  },
  loader: async () => {
    const admin = await adminExistsFn()
    return { adminExists: admin.exists }
  },
  component: LoginPage,
  head: () => ({
    meta: [{ title: 'Admin — Ternak Review' }],
  }),
})

function LoginPage() {
  const { adminExists } = Route.useLoaderData()
  return <AuthPage adminExists={adminExists} />
}
