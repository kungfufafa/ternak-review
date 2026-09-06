import { createContext, useContext } from "react"

export type AppUser = {
  email: string
  name: string | null
  role: 'ADMIN' | 'USER'
  hasPassword: boolean
}

export const AdminUserContext = createContext<AppUser>({
  email: "",
  name: null,
  role: 'USER',
  hasPassword: false,
})

export function useAdminUser() {
  return useContext(AdminUserContext)
}
