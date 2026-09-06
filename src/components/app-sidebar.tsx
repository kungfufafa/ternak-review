"use client"

import { Link, useRouterState } from "@tanstack/react-router"
import { BrandMark } from "#/components/brand-mark"
import { getNavGroups } from "#/components/app-shared.tsx"
import { NavGroup } from "#/components/nav-group.tsx"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenuButton,
} from "#/components/ui/sidebar.tsx"

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navGroups = getNavGroups(pathname)

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenuButton asChild>
          <Link to={pathname.startsWith("/app") ? "/app" : "/admin"}>
            <BrandMark className="size-4 rounded-sm" title="" />
            <span>
              Ternak
              <em className="font-normal text-pine italic">Review</em>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <NavGroup key={`sidebar-group-${index}`} {...group} />
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
