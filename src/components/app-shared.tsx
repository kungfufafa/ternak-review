import type { ReactNode } from "react"
import { can, canAny, type Permission } from "#/lib/access"
import {
  FactoryIcon,
  GlobeIcon,
  HandshakeIcon,
  HouseIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  MailIcon,
  MapPinIcon,
  PaletteIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldIcon,
  StoreIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react"

export type SidebarNavItem = {
  title: string
  path?: string
  icon?: ReactNode
  isActive?: boolean
  subItems?: SidebarNavItem[]
  permission?: Permission
  anyOf?: readonly Permission[]
  hideWhen?: Permission
}

export type SidebarNavGroup = {
  label?: string
  items: SidebarNavItem[]
}

export function isAdminHome(pathname: string) {
  return pathname === "/admin" || pathname === "/admin/"
}

type NavGate = {
  permission?: Permission
  anyOf?: readonly Permission[]
  hideWhen?: Permission
}

function navAllowed(
  role: string | readonly string[] | null | undefined,
  gate: NavGate,
) {
  if (gate.hideWhen && can(role, gate.hideWhen)) return false
  if (gate.anyOf) return canAny(role, gate.anyOf)
  if (gate.permission) return can(role, gate.permission)
  return true
}

export function getNavGroups(
  pathname: string,
  role?: string | readonly string[] | null,
): SidebarNavGroup[] {
  const onProduction = pathname.startsWith("/admin/stock")
  const onUnits = pathname.startsWith("/dashboard/units")
  const onAffiliate = pathname.startsWith("/admin/affiliate")

  const groups: SidebarNavGroup[] = [
    {
      items: [
        {
          title: "Beranda",
          path: "/admin",
          icon: <HouseIcon />,
          isActive: isAdminHome(pathname),
          permission: "home.read",
        },
        {
          title: "Kartu saya",
          path: "/app",
          icon: <StoreIcon />,
          isActive: pathname === "/app" || pathname.startsWith("/app/units"),
          permission: "cards.read.own",
          hideWhen: "cards.read.all",
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
          permission: "stock.read",
        },
        {
          title: "Desain kartu",
          path: "/admin/card",
          icon: <PaletteIcon />,
          isActive: pathname.startsWith("/admin/card"),
          permission: "card.design.read",
        },
        {
          title: "Kartu & aktivasi",
          path: "/dashboard/units",
          icon: <StoreIcon />,
          isActive: onUnits,
          anyOf: ["cards.read.all", "cards.read.own"],
        },
        {
          title: "Prospek toko",
          path: can(role, "home.read") ? "/admin/prospects" : "/app/prospects",
          icon: <TargetIcon />,
          isActive:
            pathname.startsWith("/admin/prospects") ||
            pathname.startsWith("/app/prospects"),
          permission: "prospects.manage.own",
        },
      ],
    },
    {
      label: "Akun",
      items: [
        {
          title: "Akun pemegang",
          path: "/admin/users",
          icon: <UsersIcon />,
          isActive: pathname.startsWith("/admin/users"),
          permission: "holders.read",
        },
        {
          title: "Akses peran",
          path: "/admin/access",
          icon: <ShieldIcon />,
          isActive: pathname.startsWith("/admin/access"),
          permission: "access.manage",
        },
      ],
    },
    {
      label: "Pengaturan",
      items: [
        {
          title: "Halaman publik",
          path: "/admin/site",
          icon: <GlobeIcon />,
          isActive: pathname.startsWith("/admin/site"),
          permission: "site.read",
        },
        {
          title: "Aktivasi kartu",
          path: "/admin/activation",
          icon: <KeyRoundIcon />,
          isActive: pathname.startsWith("/admin/activation"),
          permission: "activation.manage",
        },
        {
          title: "Paket review",
          path: "/admin/packages",
          icon: <Settings2Icon />,
          isActive: pathname.startsWith("/admin/packages"),
          permission: "packages.read",
        },
        {
          title: "WhatsApp Gateway",
          path: "/admin/whatsapp",
          icon: <MessageCircleIcon />,
          isActive: pathname.startsWith("/admin/whatsapp"),
          permission: "whatsapp.read",
        },
        {
          title: "Google Maps",
          path: "/admin/google",
          icon: <MapPinIcon />,
          isActive: pathname.startsWith("/admin/google"),
          permission: "google.read",
        },
        {
          title: "Email",
          path: "/admin/smtp",
          icon: <MailIcon />,
          isActive: pathname.startsWith("/admin/smtp"),
          permission: "email.read",
        },
        {
          title: "Log kiriman",
          path: "/admin/logs",
          icon: <ScrollTextIcon />,
          isActive: pathname.startsWith("/admin/logs"),
          permission: "logs.read",
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
          permission: "affiliate.read",
        },
      ],
    },
  ]

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => navAllowed(role, item)),
    }))
    .filter((group) => group.items.length > 0)
}

export function getFooterNavLinks(): SidebarNavItem[] {
  return []
}

export function getActivePage(
  pathname: string,
  role?: string | readonly string[] | null,
): SidebarNavItem | undefined {
  const items = getNavGroups(pathname, role).flatMap((group) =>
    group.items.flatMap((item) =>
      item.subItems?.length ? [item, ...item.subItems] : [item],
    ),
  )
  return items.find((item) => item.isActive) ?? items[0]
}
