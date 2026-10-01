import { createContext, useContext } from "react"
import { permissionsFor } from "#/lib/access"

export type AppUser = {
  email: string
  name: string | null
  role: string
  hasPassword: boolean
  permissions: string[]
}

export const AdminUserContext = createContext<AppUser>({
  email: "",
  name: null,
  role: 'USER',
  hasPassword: false,
  permissions: [...permissionsFor('USER')],
})

export function useAdminUser() {
  return useContext(AdminUserContext)
}
