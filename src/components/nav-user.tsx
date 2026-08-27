"use client"

import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { ChevronsUpDownIcon, KeyRoundIcon, LogOutIcon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useAdminUser } from "#/components/admin-user"
import { Alert } from "#/components/ui/alert"
import {
  Avatar,
  AvatarFallback,
} from "#/components/ui/avatar.tsx"
import { Button } from "#/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field"
import { Input } from "#/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Spinner } from "#/components/ui/spinner"
import { changePasswordFn, logoutFn } from "#/server/functions"

export function NavUser() {
  const { email } = useAdminUser()
  const logout = useServerFn(logoutFn)
  const changePassword = useServerFn(changePasswordFn)
  const router = useRouter()
  const initial = (email[0] ?? "A").toUpperCase()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onChangePassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await changePassword({
        data: { currentPassword, newPassword },
      })
      setCurrentPassword("")
      setNewPassword("")
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal ganti password")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Profil admin"
          className="flex max-w-56 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          type="button"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-1 sm:grid">
            <span className="truncate text-sm font-medium leading-tight">
              Admin
            </span>
            <span className="truncate text-xs leading-tight text-muted-foreground">
              {email}
            </span>
          </span>
          <ChevronsUpDownIcon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 font-normal">
            <Avatar className="size-8">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium text-foreground">
                Admin
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              setError(null)
              setSaved(false)
              window.setTimeout(() => setSheetOpen(true), 0)
            }}
          >
            <KeyRoundIcon />
            Ganti password
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await logout()
              await router.navigate({ to: "/login" })
            }}
            variant="destructive"
          >
            <LogOutIcon />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>

    <Sheet
      onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) {
          setCurrentPassword("")
          setNewPassword("")
          setError(null)
          setSaved(false)
        }
      }}
      open={sheetOpen}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Ganti password</SheetTitle>
          <SheetDescription>
            Password baru minimal 12 karakter. Semua sesi lama akan dicabut.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col" onSubmit={onChangePassword}>
          <div className="px-4">
            <FieldGroup>
              {error ? <Alert variant="danger">{error}</Alert> : null}
              {saved ? <Alert variant="success">Password diganti.</Alert> : null}
              <Field>
                <FieldLabel htmlFor="current-password">Password sekarang</FieldLabel>
                <Input
                  autoComplete="current-password"
                  id="current-password"
                  maxLength={200}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">Password baru</FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="new-password"
                  maxLength={200}
                  minLength={12}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </Field>
            </FieldGroup>
          </div>
          <SheetFooter>
            <Button disabled={busy} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? "Menyimpan…" : "Simpan password"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
    </>
  )
}
