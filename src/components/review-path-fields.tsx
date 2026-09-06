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
            ? 'Paket menentukan jalur review tamu. Nomor WhatsApp tindak lanjut diisi oleh pengelola toko.'
            : 'Paket ditetapkan admin. Hubungi admin jika ingin mengubah paket kartu.'}
        </FieldDescription>
      </Field>
      {proOffline ? (
        <p className="text-sm text-muted-foreground">
          WhatsApp platform sedang tidak tersambung. Paket Pro tetap bisa
          dipakai: masukan anonim masuk ke Log kiriman sebagai antrean dan
          dapat dikirim ulang setelah gateway tersambung.{' '}
          {allowTierChange
            ? viewerRole === 'ADMIN'
              ? 'Buka pengaturan WhatsApp untuk menyambungkan kembali layanan.'
              : 'Hubungi admin untuk menyambungkan kembali WhatsApp.'
            : 'Hubungi admin jika antrean perlu segera dikirim.'}
        </p>
      ) : allowTierChange && !whatsappGatewayOpen ? (
        <p className="text-sm text-muted-foreground">
          Paket Pro tetap tersedia saat gateway offline. Masukan anonim akan
          masuk ke Log kiriman dan menunggu dikirim ulang.{' '}
          {viewerRole === 'ADMIN'
            ? 'Buka pengaturan WhatsApp untuk menyambungkannya.'
            : 'Hubungi admin untuk menyambungkannya.'}
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
