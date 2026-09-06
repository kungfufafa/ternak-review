import { Link } from '@tanstack/react-router'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input, Select } from '#/components/ui/input'
import {
  packageAvailable,
  packageNeedsOwnerWhatsapp,
  packageSetupCopy,
  type ServicePackage,
  type ServiceTier,
} from '#/lib/review-settings'

export function ReviewPathFields({
  packages,
  serviceTier,
  ownerWhatsapp,
  whatsappGatewayOpen,
  viewerRole = 'USER',
  allowTierChange = true,
  onTierChange,
  onWhatsappChange,
}: {
  packages: ServicePackage[]
  serviceTier: ServiceTier
  ownerWhatsapp: string
  whatsappGatewayOpen: boolean
  viewerRole?: 'ADMIN' | 'USER'
  allowTierChange?: boolean
  onTierChange: (tier: ServiceTier) => void
  onWhatsappChange: (value: string) => void
}) {
  const servicePackage =
    packages.find((item) => item.serviceTier === serviceTier) ?? packages[0]
  const needsWhatsapp = packageNeedsOwnerWhatsapp(serviceTier)
  const selectable = packages.filter(
    (item) =>
      packageAvailable(item.serviceTier, whatsappGatewayOpen) ||
      item.serviceTier === serviceTier,
  )
  const proOffline = serviceTier === 'PRO' && !whatsappGatewayOpen
  const reconnectHint =
    viewerRole === 'ADMIN' ? (
      <>
        <Link
          className="text-pine underline underline-offset-4"
          to="/admin/whatsapp"
        >
          Buka pengaturan WhatsApp
        </Link>{' '}
        untuk menyambungkannya.
      </>
    ) : (
      'Hubungi admin untuk menyambungkannya.'
    )

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={allowTierChange ? 'review-tier' : undefined}>
          Paket kartu
        </FieldLabel>
        {allowTierChange ? (
          <Select
            id="review-tier"
            onChange={(event) => {
              const selected = packages.find(
                (item) => item.serviceTier === event.target.value,
              )
              if (selected) onTierChange(selected.serviceTier)
            }}
            value={serviceTier}
          >
            {selectable.map((item) => (
              <option key={item.serviceTier} value={item.serviceTier}>
                {item.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="font-medium">{servicePackage?.name ?? serviceTier}</p>
        )}
        <FieldDescription>
          {allowTierChange
            ? viewerRole === 'ADMIN'
              ? 'Paket menentukan jalur review tamu setelah tempel atau scan.'
              : 'Paket menentukan jalur review tamu. Nomor WhatsApp tindak lanjut diisi pengelola toko.'
            : 'Paket ditetapkan admin. Hubungi admin jika ingin mengubah paket kartu.'}
        </FieldDescription>
      </Field>
      {proOffline ? (
        <p className="text-sm text-muted-foreground">
          WhatsApp belum tersambung. Paket Pro tetap bisa dipakai: masukan
          anonim masuk antrean dan bisa dikirim ulang setelah tersambung.{' '}
          {allowTierChange
            ? reconnectHint
            : 'Hubungi admin jika antrean perlu segera dikirim.'}
        </p>
      ) : allowTierChange && !whatsappGatewayOpen ? (
        <p className="text-sm text-muted-foreground">
          WhatsApp belum tersambung. Paket Pro tetap bisa dipilih; masukan
          anonim masuk antrean dan bisa dikirim ulang setelah tersambung.{' '}
          {reconnectHint}
        </p>
      ) : null}
      {servicePackage ? (
        <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
          {packageSetupCopy(serviceTier, servicePackage.interceptMaxRating)}
        </p>
      ) : null}
      {needsWhatsapp ? (
        <Field>
          <FieldLabel htmlFor="review-owner-whatsapp">
            Nomor WhatsApp owner (wajib untuk Plus/Pro)
          </FieldLabel>
          <Input
            id="review-owner-whatsapp"
            inputMode="tel"
            maxLength={32}
            onChange={(event) => onWhatsappChange(event.target.value)}
            placeholder="08xxxxxxxxxx"
            required
            value={ownerWhatsapp}
          />
          <FieldDescription>
            {serviceTier === 'PRO'
              ? 'Isi form masuk antrean WhatsApp untuk dikirim ke nomor ini. Tamu tidak melihatnya.'
              : 'Rating rendah membuka chat ke nomor ini. Tamu tidak mengetik nomor.'}
          </FieldDescription>
        </Field>
      ) : null}
    </div>
  )
}
