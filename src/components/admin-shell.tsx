"use client"

import type { ReactNode } from "react"
import { AdminUserContext, type AppUser } from "#/components/admin-user"
import { AppShell } from "#/components/app-shell"

export function AdminShell({
  user,
  children,
}: {
  user: AppUser
  children: ReactNode
}) {
  return (
    <AdminUserContext.Provider value={user}>
      <AppShell>{children}</AppShell>
    </AdminUserContext.Provider>
  )
}

export { useAdminUser } from "#/components/admin-user"
