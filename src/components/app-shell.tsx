import type { ReactNode } from "react"
import { AppHeader } from "#/components/app-header.tsx"
import { AppSidebar } from "#/components/app-sidebar.tsx"
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar.tsx"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden bg-background print:overflow-visible">
      <div className="brand-stripe print-hide" />
      <SidebarProvider className="relative h-[calc(100svh-3px)] has-data-[variant=inset]:bg-background print:h-auto">
        <AppSidebar />
        <SidebarInset className="bg-background print:m-0 print:rounded-none print:shadow-none md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
          <AppHeader />
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 print:overflow-visible print:p-0 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
