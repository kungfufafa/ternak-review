import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth-page'
import {
  adminExistsFn,
  getCurrentOwnerFn,
  otpLoginAvailableFn,
} from '#/server/functions'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const owner = await getCurrentOwnerFn()
    if (owner) {
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
  return (
    <AuthPage
      adminExists={adminExists}
      emailOtp={emailOtp}
      whatsappOtp={whatsappOtp}
    />
  )
}
