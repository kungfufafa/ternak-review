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
import { getSiteSettingsFn, saveSiteSettingsFn } from '#/server/functions'

export const Route = createFileRoute('/admin/site')({
  loader: () => getSiteSettingsFn(),
  component: SiteSettingsPage,
  head: () => ({
    meta: [{ title: 'Halaman publik — Ternak Review' }],
  }),
})

function SiteSettingsPage() {
  const settings = Route.useLoaderData()
  const saveFn = useServerFn(saveSiteSettingsFn)
  const router = useRouter()
  const [homeEnabled, setHomeEnabled] = useState(settings.homeEnabled)
  const [affiliateEnabled, setAffiliateEnabled] = useState(
    settings.affiliateEnabled,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await saveFn({
        data: { homeEnabled, affiliateEnabled },
      })
      setHomeEnabled(next.homeEnabled)
      setAffiliateEnabled(next.affiliateEnabled)
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
        description="Matikan beranda marketing atau form affiliate kalau lagi fokus jualan kartu. Login, aktivasi, dan dashboard tetap jalan."
        title="Halaman publik"
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? (
        <Alert variant="success">Pengaturan halaman publik disimpan.</Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Yang tampil di internet</CardTitle>
          <CardDescription>
            Beranda mati: ternakreview.com langsung ke login. Affiliate mati:
            form daftar ditutup, link di header/footer hilang.
          </CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void onSave(event)}>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                checked={homeEnabled}
                className="mt-1"
                onChange={(event) => setHomeEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-medium">Beranda marketing</span>
                <FieldDescription>
                  Halaman jual program “cuan 10×”. Kalau off, pengunjung masuk
                  ke login.
                </FieldDescription>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                checked={affiliateEnabled}
                className="mt-1"
                onChange={(event) => setAffiliateEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-medium">Halaman affiliate</span>
                <FieldDescription>
                  Form daftar di /affiliate. Data lama di admin tetap ada.
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
