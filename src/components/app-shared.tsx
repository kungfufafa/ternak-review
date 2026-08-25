import type { ReactNode } from "react"
import {
  FactoryIcon,
  HandshakeIcon,
  HouseIcon,
  StoreIcon,
} from "lucide-react"

export type SidebarNavItem = {
  title: string
  path?: string
  icon?: ReactNode
  isActive?: boolean
  subItems?: SidebarNavItem[]
}

export type SidebarNavGroup = {
  label?: string
  items: SidebarNavItem[]
}

export function isAdminHome(pathname: string) {
  return pathname === "/admin" || pathname === "/admin/"
}

export function getNavGroups(pathname: string): SidebarNavGroup[] {
  const onProduction = pathname.startsWith("/admin/stock")
  const onUnits = pathname.startsWith("/dashboard/units")
  const onAffiliate = pathname.startsWith("/admin/affiliate")

  return [
    {
      items: [
        {
          title: "Beranda",
          path: "/admin",
          icon: <HouseIcon />,
          isActive: isAdminHome(pathname),
        },
        {
          title: "Produksi",
          path: "/admin/stock",
          icon: <FactoryIcon />,
          isActive: onProduction,
        },
      ],
    },
    {
      label: "Toko",
      items: [
        {
          title: "Kartu toko",
          path: "/dashboard/units",
          icon: <StoreIcon />,
          isActive: onUnits,
        },
      ],
    },
    {
      label: "Partner",
      items: [
        {
          title: "Affiliate",
          path: "/admin/affiliate",
          icon: <HandshakeIcon />,
          isActive: onAffiliate,
        },
      ],
    },
  ]
}

export function getFooterNavLinks(): SidebarNavItem[] {
  return []
}

export function getActivePage(pathname: string): SidebarNavItem | undefined {
  const items = getNavGroups(pathname).flatMap((group) =>
    group.items.flatMap((item) =>
      item.subItems?.length ? [item, ...item.subItems] : [item],
    ),
  )
  return items.find((item) => item.isActive) ?? items[0]
}
