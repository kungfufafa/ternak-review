import { createContext, useContext } from "react"

export const AdminUserContext = createContext({ email: "" })

export function useAdminUser() {
  return useContext(AdminUserContext)
}
