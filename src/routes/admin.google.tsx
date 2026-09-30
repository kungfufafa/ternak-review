import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { PageHeader } from '#/components/page'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  clearGooglePlacesKeyFn,
  getGooglePlacesSettingsFn,
  saveGooglePlacesKeyFn,
  testGooglePlacesKeyFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/google')({
  loader: () => getGooglePlacesSettingsFn(),
  component: GooglePlacesPage,
  head: () => ({
    meta: [{ title: 'Google Maps — Ternak Review' }],
  }),
})

function GooglePlacesPage() {
  const settings = Route.useLoaderData()
  const saveFn = useServerFn(saveGooglePlacesKeyFn)
  const testFn = useServerFn(testGooglePlacesKeyFn)
  const clearFn = useServerFn(clearGooglePlacesKeyFn)
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [tested, setTested] = useState(false)

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!apiKey.trim()) return
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await saveFn({ data: { apiKey } })
      setApiKey('')
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menyimpan API key Google.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await testFn({
        data: apiKey.trim() ? { apiKey } : {},
      })
      setApiKey('')
      await refresh()
      setTested(true)
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Tes Google Places gagal.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onClear() {
    setBusy(true)
    setError(null)
    setSaved(false)
    setTested(false)
    try {
      await clearFn()
      setApiKey('')
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus key UI.')
    } finally {
      setBusy(false)
    }
  }

  const canSave = apiKey.trim().length >= 20
  const canTest = canSave || settings.configured

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description="Key Places API (New) untuk pilih listing Google Maps saat aktivasi. Ganti dari sini kalau kuota habis — tanpa redeploy."
        title="Google Maps"
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {tested ? (
        <Alert variant="success">
          Google Places merespons. Key dipakai untuk autocomplete dan nearby.
        </Alert>
      ) : saved ? (
        <Alert variant="success">Pengaturan Google Maps disimpan.</Alert>
      ) : null}
      {settings.source === 'ui' ? (
        <Alert>
          Key aktif dari UI (••••{settings.last4}). Mengganti key tidak perlu
          deploy ulang.
        </Alert>
      ) : settings.source === 'env' ? (
        <Alert>
          Masih ada key lama di secret server. Simpan key di halaman ini, lalu
          key server tidak dipakai lagi.
        </Alert>
      ) : (
        <Alert variant="danger">
          Belum ada API key. Aktivasi toko memakai daftar uji, bukan Google
          Maps asli.
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>API key</CardTitle>
          <CardDescription>
            Google Cloud → Credentials → API key. Aktifkan Places API (New).
            Batasi key ke Places saja. Key disimpan terenkripsi.
          </CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void onSave(event)}>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="google-api-key">API key</FieldLabel>
              <Input
                autoComplete="off"
                id="google-api-key"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  settings.hasUiKey
                    ? `Tersimpan (••••${settings.last4}). Isi untuk ganti.`
                    : 'AIza…'
                }
                spellCheck={false}
                type="password"
                value={apiKey}
              />
              <FieldDescription>
                Kosongkan lalu Simpan tidak mengubah key yang sudah ada. Hapus
                key UI kalau mau kosongkan sama sekali.
              </FieldDescription>
            </Field>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button disabled={busy || !canSave} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Simpan
            </Button>
            <Button
              disabled={busy || !canTest}
              onClick={() => void onTest()}
              type="button"
              variant="outline"
            >
              Tes Places
            </Button>
            {settings.hasUiKey ? (
              <Button
                disabled={busy}
                onClick={() => void onClear()}
                type="button"
                variant="ghost"
              >
                Hapus key UI
              </Button>
            ) : null}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
