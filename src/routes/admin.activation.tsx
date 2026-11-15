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
import { FieldDescription } from '#/components/ui/field'
import { Spinner } from '#/components/ui/spinner'
import {
  getActivationSettingsFn,
  saveActivationSettingsFn,
} from '#/server/functions'

export const Route = createFileRoute('/admin/activation')({
  loader: () => getActivationSettingsFn(),
  component: ActivationSettingsPage,
  head: () => ({
    meta: [{ title: 'Aktivasi kartu — Ternak Review' }],
  }),
})

function ActivationSettingsPage() {
  const settings = Route.useLoaderData()
  const saveFn = useServerFn(saveActivationSettingsFn)
  const router = useRouter()
  const [pinEnabled, setPinEnabled] = useState(settings.pinEnabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await saveFn({ data: { pinEnabled } })
      setPinEnabled(next.pinEnabled)
      await router.invalidate({ sync: true })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        description="Atur apakah memasang kartu ke toko lewat link aktivasi meminta PIN pemegang."
        title="Aktivasi kartu"
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? (
        <Alert variant="success">
          {pinEnabled
            ? 'PIN aktivasi dinyalakan. Berlaku untuk aktivasi berikutnya.'
            : 'PIN aktivasi dimatikan. Berlaku untuk aktivasi berikutnya.'}
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>PIN aktivasi</CardTitle>
          <CardDescription>
            Berlaku untuk semua kartu yang belum terpasang. Admin, dan pemegang
            yang sedang masuk ke akunnya, tidak pernah diminta PIN.
          </CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void onSave(event)}>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                checked={pinEnabled}
                className="mt-1"
                onChange={(event) => setPinEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-medium">
                  Wajibkan PIN pemegang saat aktivasi
                </span>
                <FieldDescription>
                  {pinEnabled
                    ? 'Nyala: yang membuka link aktivasi harus memasukkan PIN pemegang kartu sebelum memilih toko.'
                    : 'Mati: siapa pun yang memegang kartu bisa memasangnya ke toko tanpa PIN. Kartu yang belum punya pemegang terpasang tanpa pemegang, kecuali yang memasang sedang masuk ke akunnya.'}
                </FieldDescription>
              </span>
            </label>
          </CardContent>
          <CardFooter>
            <Button disabled={busy} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Simpan
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
