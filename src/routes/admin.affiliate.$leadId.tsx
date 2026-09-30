import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useState, type FormEvent } from 'react'
import { ConfirmDelete } from '#/components/confirm-delete'
import { affiliatePlatforms } from '#/components/marketing/affiliate/content'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '#/components/ui/toggle-group'
import { formatDay } from '#/lib/utils'
import {
  deleteAffiliateLeadFn,
  getAffiliateLeadFn,
  updateAffiliateLeadFn,
} from '#/server/functions'
import type { SerializedAffiliateLead } from '#/server/affiliate'
import type {
  AffiliateFieldErrors,
  AffiliatePlatformKey,
} from '#/types/marketing'

export const Route = createFileRoute('/admin/affiliate/$leadId')({
  loader: async ({ params }) => {
    const lead = await getAffiliateLeadFn({ data: { leadId: params.leadId } })
    if (!lead) throw notFound()
    return { lead }
  },
  component: AffiliateLeadPage,
  head: () => ({
    meta: [{ title: 'Affiliate — Ternak Review' }],
  }),
})

function AffiliateLeadPage() {
  const { lead } = Route.useLoaderData()
  return <AffiliateLeadEditor key={lead.id} lead={lead} />
}

function AffiliateLeadEditor({ lead }: { lead: SerializedAffiliateLead }) {
  const router = useRouter()
  const updateLead = useServerFn(updateAffiliateLeadFn)
  const deleteLead = useServerFn(deleteAffiliateLeadFn)

  const [nama, setNama] = useState(lead.nama)
  const [email, setEmail] = useState(lead.email)
  const [whatsapp, setWhatsapp] = useState(lead.whatsapp)
  const [selected, setSelected] = useState<AffiliatePlatformKey[]>(
    lead.platforms.filter((key): key is AffiliatePlatformKey =>
      affiliatePlatforms.some((platform) => platform.key === key),
    ),
  )
  const [usernames, setUsernames] = useState<
    Partial<Record<AffiliatePlatformKey, string>>
  >({ ...lead.usernames })
  const [errors, setErrors] = useState<AffiliateFieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectedPlatforms = useMemo(
    () => affiliatePlatforms.filter((platform) => selected.includes(platform.key)),
    [selected],
  )

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setBanner(null)
    setSuccess(false)
    setBusy(true)
    try {
      const cleaned: Record<string, string> = {}
      for (const key of selected) {
        const value = usernames[key]?.trim()
        if (value) cleaned[key] = value
      }
      const result = await updateLead({
        data: {
          leadId: lead.id,
          nama,
          email,
          whatsapp,
          platforms: selected,
          usernames: cleaned,
        },
      })
      if (!result.ok) {
        setErrors(result.fields)
        setBanner(result.error)
        return
      }
      setErrors({})
      setSuccess(true)
      await router.invalidate()
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`mailto:${lead.email}`}>Email</a>
            </Button>
            <Button asChild>
              <a href={lead.whatsappUrl} rel="noreferrer" target="_blank">
                WhatsApp
              </a>
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              type="button"
              variant="destructive"
            >
              Hapus
            </Button>
          </div>
        }
        description={`Daftar ${formatDay(lead.createdAt)}`}
        title={lead.nama}
      />

      <Link
        className="text-sm text-muted-foreground hover:text-foreground"
        to="/admin/affiliate"
      >
        ← Semua pendaftar
      </Link>

      {banner ? <Alert variant="danger">{banner}</Alert> : null}
      {success ? <Alert variant="success">Perubahan disimpan.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Data pendaftar</CardTitle>
          <CardDescription>
            Ubah kalau ada typo atau platform yang baru.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSave}>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={errors.nama || undefined}>
                <FieldLabel htmlFor="lead-nama">Nama</FieldLabel>
                <Input
                  aria-invalid={errors.nama || undefined}
                  id="lead-nama"
                  onChange={(event) => setNama(event.target.value)}
                  value={nama}
                />
                {errors.nama ? <FieldError>Nama wajib diisi.</FieldError> : null}
              </Field>
              <Field data-invalid={errors.email || undefined}>
                <FieldLabel htmlFor="lead-email">Email</FieldLabel>
                <Input
                  aria-invalid={errors.email || undefined}
                  id="lead-email"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
                {errors.email ? (
                  <FieldError>Email tidak valid.</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={errors.whatsapp || undefined}>
                <FieldLabel htmlFor="lead-whatsapp">WhatsApp</FieldLabel>
                <Input
                  aria-invalid={errors.whatsapp || undefined}
                  id="lead-whatsapp"
                  onChange={(event) => setWhatsapp(event.target.value)}
                  value={whatsapp}
                />
                {errors.whatsapp ? (
                  <FieldError>Nomor WhatsApp tidak valid.</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={errors.platforms || undefined}>
                <FieldLabel>Platform</FieldLabel>
                <ToggleGroup
                  className="flex flex-wrap"
                  onValueChange={(value) =>
                    setSelected(value as AffiliatePlatformKey[])
                  }
                  spacing={2}
                  type="multiple"
                  value={selected}
                  variant="outline"
                >
                  {affiliatePlatforms.map((platform) => (
                    <ToggleGroupItem key={platform.key} value={platform.key}>
                      {platform.value}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {errors.platforms ? (
                  <FieldError>Pilih minimal satu platform.</FieldError>
                ) : (
                  <FieldDescription>
                    Username hanya wajib untuk platform yang dipilih.
                  </FieldDescription>
                )}
              </Field>
              {selectedPlatforms.map((platform) => (
                <Field
                  data-invalid={errors[`user-${platform.key}`] || undefined}
                  key={platform.key}
                >
                  <FieldLabel htmlFor={`lead-user-${platform.key}`}>
                    {platform.label}
                  </FieldLabel>
                  <Input
                    aria-invalid={errors[`user-${platform.key}`] || undefined}
                    id={`lead-user-${platform.key}`}
                    onChange={(event) =>
                      setUsernames((current) => ({
                        ...current,
                        [platform.key]: event.target.value,
                      }))
                    }
                    placeholder={platform.placeholder}
                    value={usernames[platform.key] ?? ''}
                  />
                  {errors[`user-${platform.key}`] ? (
                    <FieldError>Username wajib diisi.</FieldError>
                  ) : null}
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={busy} type="submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? 'Menyimpan…' : 'Simpan perubahan'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <ConfirmDelete
        description={`${lead.nama} akan dihapus dari daftar. Ini tidak bisa dibatalkan.`}
        onConfirm={async () => {
          setDeleting(true)
          try {
            await deleteLead({ data: { leadId: lead.id } })
            setConfirmOpen(false)
            await router.navigate({ to: '/admin/affiliate' })
          } finally {
            setDeleting(false)
          }
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={deleting}
        title="Hapus pendaftar?"
      />
    </div>
  )
}
