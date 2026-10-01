import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { PERMISSION_GROUPS, type Permission } from '#/lib/access'
import {
  createRoleFn,
  deleteRoleFn,
  listRoleGrantsFn,
  saveRoleGrantsFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/access')({
  loader: () => listRoleGrantsFn(),
  component: AccessPage,
  head: () => ({
    meta: [{ title: 'Akses peran — Ternak Review' }],
  }),
})

function AccessPage() {
  const roles = Route.useLoaderData()
  const router = useRouter()
  const saveFn = useServerFn(saveRoleGrantsFn)
  const createFn = useServerFn(createRoleFn)
  const removeFn = useServerFn(deleteRoleFn)
  const editable = roles.filter((role) => !role.locked)
  const [role, setRole] = useState(editable[0]?.key ?? 'ADMIN')
  const [selected, setSelected] = useState<Record<string, string[]>>(
    Object.fromEntries(roles.map((item) => [item.key, item.permissions])),
  )
  const [name, setName] = useState('')
  const [draftName, setDraftName] = useState(editable[0]?.name ?? '')
  const [pendingDelete, setPendingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const currentRole = roles.find((item) => item.key === role)
  const current = new Set(selected[role] ?? [])

  function toggle(permission: Permission) {
    setSaved(false)
    setSelected((prev) => {
      const next = new Set(prev[role] ?? [])
      if (next.has(permission)) next.delete(permission)
      else next.add(permission)
      return { ...prev, [role]: [...next] }
    })
  }

  async function onSave() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await saveFn({
        data: { role, name: draftName, permissions: selected[role] ?? [] },
      })
      setSaved(true)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akses.')
    } finally {
      setBusy(false)
    }
  }

  async function onCreate() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const created = await createFn({ data: { name } })
      setName('')
      setRole(created.key)
      setSelected((prev) => ({ ...prev, [created.key]: [] }))
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah peran.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!currentRole || currentRole.system) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await removeFn({ data: { key: currentRole.key } })
      const next = editable.find((item) => item.key !== currentRole.key)
      setRole(next?.key ?? 'ADMIN')
      setDraftName(next?.name ?? 'Admin')
      setPendingDelete(false)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus peran.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6">
      <PageHeader
        title="Akses peran"
        description="Tambah peran sesuai kebutuhan, lalu centang apa yang boleh dilihat dan diubah."
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? (
        <Alert variant="success">Akses {currentRole?.name ?? role} disimpan.</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {roles.map((item) => (
          <Button
            key={item.key}
            onClick={() => {
              setRole(item.key)
              setDraftName(item.name)
              setSaved(false)
            }}
            type="button"
            variant={role === item.key ? 'default' : 'outline'}
          >
            {item.name}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nama peran baru"
          value={name}
        />
        <Button
          disabled={busy || name.trim().length < 2}
          onClick={() => void onCreate()}
          type="button"
          variant="outline"
        >
          Tambah peran
        </Button>
      </div>
      {currentRole && !currentRole.locked ? (
        <Input
          maxLength={40}
          onChange={(event) => {
            setDraftName(event.target.value)
            setSaved(false)
          }}
          value={draftName}
        />
      ) : null}
      {currentRole?.locked ? (
        <Card>
          <CardHeader>
            <CardTitle>{currentRole.name}</CardTitle>
            <CardDescription>
              Peran ini selalu memegang semua akses dan tidak bisa dikurangi.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <Card key={group.label}>
                <CardHeader>
                  <CardTitle>{group.label}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {group.items.map((item) => (
                    <label key={item.id} className="flex items-start gap-3 text-sm">
                      <input
                        checked={current.has(item.id)}
                        className="mt-0.5 size-4 accent-primary"
                        onChange={() => toggle(item.id)}
                        type="checkbox"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {currentRole && !currentRole.system ? (
              <Button
                disabled={busy}
                onClick={() => setPendingDelete(true)}
                type="button"
                variant="outline"
              >
                Hapus peran
              </Button>
            ) : null}
            <Button disabled={busy || !currentRole} onClick={() => void onSave()} type="button">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Simpan {currentRole?.name ?? 'peran'}
            </Button>
          </div>
        </>
      )}
      <ConfirmDelete
        confirmLabel="Hapus peran"
        description="Peran ini dihapus. Akun yang masih memakainya harus dipindahkan dulu."
        onConfirm={() => void onDelete()}
        onOpenChange={setPendingDelete}
        open={pendingDelete}
        pending={busy}
        title="Hapus peran?"
      />
    </div>
  )
}
