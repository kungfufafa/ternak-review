import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth-page'
import {
  adminExistsFn,
  getCurrentOwnerFn,
  otpLoginAvailableFn,
} from '#/server/functions'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): {
    activation?: string
    ref?: string
  } => ({
    activation:
      typeof search.activation === 'string' && /^[a-z0-9]{4,32}$/i.test(search.activation)
        ? search.activation.toUpperCase()
        : undefined,
    ref: typeof search.ref === 'string' ? search.ref.trim().slice(0, 80) || undefined : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const owner = await getCurrentOwnerFn()
    if (owner) {
      if (search.activation) {
        throw redirect({ to: '/activate', search: { id: search.activation, ref: search.ref } })
      }
      throw redirect({ to: owner.role === 'USER' ? '/app' : '/admin' })
    }
  },
  loader: async () => {
    const [admin, otp] = await Promise.all([
      adminExistsFn(),
      otpLoginAvailableFn(),
    ])
    return {
      adminExists: admin.exists,
      whatsappOtp: otp.whatsapp,
      emailOtp: otp.email,
    }
  },
  component: LoginPage,
  head: () => ({
    meta: [{ title: 'Masuk — Ternak Review' }],
  }),
})

function LoginPage() {
  const { adminExists, whatsappOtp, emailOtp } = Route.useLoaderData()
  const { activation, ref } = Route.useSearch()
  return (
    <AuthPage
      activation={activation}
      partnerRef={ref}
      adminExists={adminExists}
      emailOtp={emailOtp}
      whatsappOtp={whatsappOtp}
    />
  )
}
