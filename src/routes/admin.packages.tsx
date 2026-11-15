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
import { Input, Select } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  googleRangeLabel,
  ratingRangeLabel,
  type ServicePackage,
} from '#/lib/review-settings'
import { getServicePackagesFn, updateServicePackageFn } from '#/server/functions'

export const Route = createFileRoute('/admin/packages')({
  loader: () => getServicePackagesFn(),
  component: PackagesPage,
  head: () => ({
    meta: [{ title: 'Pengaturan Paket — Ternak Review' }],
  }),
})

function PackagesPage() {
  const packages = Route.useLoaderData()

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6">
      <PageHeader
        title="Pengaturan paket"
        description="Atur nama paket dan batas bintang intersep. Perubahan berlaku untuk semua kartu dalam paket, termasuk kartu yang sudah aktif."
      />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {packages.map((servicePackage) => (
          <PackageEditor key={servicePackage.serviceTier} servicePackage={servicePackage} />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Nama paket tampil saat aktivasi. Basic ke Google. Plus: rating rendah ke
        WhatsApp owner. Pro: rating rendah isi form, sistem kirim ke owner.
        Saat gateway offline, masukan Pro masuk ke Log kiriman dan menunggu
        dikirim ulang.
      </p>
    </div>
  )
}

function PackageEditor({ servicePackage }: { servicePackage: ServicePackage }) {
  const updatePackage = useServerFn(updateServicePackageFn)
  const router = useRouter()
  const [name, setName] = useState(servicePackage.name)
  const [interceptMaxRating, setInterceptMaxRating] = useState(servicePackage.interceptMaxRating)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isBasic = servicePackage.serviceTier === 'BASIC'
  const changed = name.trim() !== servicePackage.name || interceptMaxRating !== servicePackage.interceptMaxRating
  const interceptRange = ratingRangeLabel(interceptMaxRating)
  const googleRange = googleRangeLabel(interceptMaxRating)

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setSaved(false)
    setError(null)
    try {
      const result =
        servicePackage.serviceTier === 'BASIC'
          ? await updatePackage({
              data: { serviceTier: 'BASIC', name, interceptMaxRating: 0 },
            })
          : await updatePackage({
              data: {
                serviceTier: servicePackage.serviceTier,
                name,
                interceptMaxRating,
              },
            })
      setName(result.name)
      setInterceptMaxRating(result.interceptMaxRating)
      await router.invalidate({ sync: true })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pengaturan paket gagal disimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name.trim() || servicePackage.name}</CardTitle>
        <CardDescription>
          {isBasic
            ? 'Paket default · scan langsung ke Google Review Maps'
            : servicePackage.serviceTier === 'PLUS'
              ? 'Rating rendah ditawari WhatsApp owner. Google Review tetap tersedia.'
              : 'Rating rendah ditawari form ke owner. Google Review tetap tersedia.'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={save}>
        <CardContent className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor={`package-name-${servicePackage.serviceTier}`}>
              Nama paket
            </FieldLabel>
            <Input
              disabled={busy}
              id={`package-name-${servicePackage.serviceTier}`}
              maxLength={40}
              onChange={(event) => { setName(event.target.value); setSaved(false) }}
              required
              value={name}
            />
            <FieldDescription>
              Nama ini tampil saat aktivasi, di dashboard, dan di kartu pemegang.
              Kode internal: {servicePackage.serviceTier}.
            </FieldDescription>
          </Field>
          {isBasic ? (
            <p className="rounded-xl bg-muted p-3 text-sm">
              Scan langsung membuka Google Review Maps. Paket default tidak memakai intersep.
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={`package-rating-${servicePackage.serviceTier}`}>
                  Intersep sampai bintang
                </FieldLabel>
                <Select
                  disabled={busy}
                  id={`package-rating-${servicePackage.serviceTier}`}
                  onChange={(event) => {
                    setInterceptMaxRating(Number(event.target.value))
                    setSaved(false)
                  }}
                  value={String(interceptMaxRating)}
                >
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating === 1 ? 'Bintang 1 saja' : `Bintang ${rating} ke bawah`}
                    </option>
                  ))}
                </Select>
                <FieldDescription>Berlaku saat kartu memakai jalur WhatsApp atau feedback anonim.</FieldDescription>
              </Field>
              <div className="rounded-xl bg-muted p-3 text-sm" aria-live="polite">
                <p>Bintang {interceptRange} → jalur feedback kartu.</p>
                {googleRange ? (
                  <p className="mt-1">Bintang {googleRange} → Google Review Maps.</p>
                ) : (
                  <p className="mt-1">Semua bintang masuk ke jalur feedback kartu.</p>
                )}
              </div>
            </>
          )}
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {saved ? <Alert variant="success">Pengaturan paket disimpan.</Alert> : null}
        </CardContent>
        <CardFooter className="mt-5">
          <Button disabled={busy || !changed || !name.trim()} type="submit">
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {busy ? 'Menyimpan…' : 'Simpan paket'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
