"use client"

import { useRouterState } from "@tanstack/react-router"
import { useAdminUser } from "#/components/admin-user"
import { AppBreadcrumbs } from "#/components/app-breadcrumbs.tsx"
import { getActivePage } from "#/components/app-shared.tsx"
import { CustomSidebarTrigger } from "#/components/custom-sidebar-trigger.tsx"
import { NavUser } from "#/components/nav-user.tsx"
import { Separator } from "#/components/ui/separator.tsx"
import { cn } from "#/lib/utils.ts"

export function AppHeader() {
  const { permissions } = useAdminUser()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const page = getActivePage(pathname, permissions)

  return (
    <header
      className={cn(
        "print-hide sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 bg-background/80 px-4 backdrop-blur-[18px] md:px-6",
      )}
    >
      <div className="flex items-center gap-3">
        <CustomSidebarTrigger />
        <Separator
          className="mr-2 h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <AppBreadcrumbs page={page} />
      </div>
      <NavUser />
    </header>
  )
}
