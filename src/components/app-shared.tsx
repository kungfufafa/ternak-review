import type { ReactNode } from "react"
import {
  FactoryIcon,
  HandshakeIcon,
  HouseIcon,
  MessageCircleIcon,
  MailIcon,
  ScrollTextIcon,
  Settings2Icon,
  StoreIcon,
  UsersIcon,
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
  if (pathname.startsWith("/app")) {
    return [
      {
        items: [
          {
            title: "Kartu saya",
            path: "/app",
            icon: <StoreIcon />,
            isActive: pathname === "/app" || pathname.startsWith("/app/"),
          },
        ],
      },
    ]
  }

  const onProduction = pathname.startsWith("/admin/stock")
  const onUnits = pathname.startsWith("/dashboard/units")
  const onAffiliate = pathname.startsWith("/admin/affiliate")

  return [
    {
      label: "Ringkasan",
      items: [
        {
          title: "Beranda",
          path: "/admin",
          icon: <HouseIcon />,
          isActive: isAdminHome(pathname),
        },
      ],
    },
    {
      label: "Alur kartu",
      items: [
        {
          title: "Produksi kartu",
          path: "/admin/stock",
          icon: <FactoryIcon />,
          isActive: onProduction,
        },
        {
          title: "Akun pemegang",
          path: "/admin/users",
          icon: <UsersIcon />,
          isActive: pathname.startsWith("/admin/users"),
        },
        {
          title: "Kartu & aktivasi",
          path: "/dashboard/units",
          icon: <StoreIcon />,
          isActive: onUnits,
        },
      ],
    },
    {
      label: "Pengaturan",
      items: [
        {
          title: "Paket review",
          path: "/admin/packages",
          icon: <Settings2Icon />,
          isActive: pathname.startsWith("/admin/packages"),
        },
        {
          title: "WhatsApp Gateway",
          path: "/admin/whatsapp",
          icon: <MessageCircleIcon />,
          isActive: pathname.startsWith("/admin/whatsapp"),
        },
        {
          title: "Email",
          path: "/admin/smtp",
          icon: <MailIcon />,
          isActive: pathname.startsWith("/admin/smtp"),
        },
        {
          title: "Log kiriman",
          path: "/admin/logs",
          icon: <ScrollTextIcon />,
          isActive: pathname.startsWith("/admin/logs"),
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
