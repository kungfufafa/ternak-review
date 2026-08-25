"use client"

import type { ReactNode } from "react"
import { AdminUserContext } from "#/components/admin-user"
import { AppShell } from "#/components/app-shell"

export function AdminShell({
  email,
  children,
}: {
  email: string
  children: ReactNode
}) {
  return (
    <AdminUserContext.Provider value={{ email }}>
      <AppShell>{children}</AppShell>
    </AdminUserContext.Provider>
  )
}

export { useAdminUser } from "#/components/admin-user"
