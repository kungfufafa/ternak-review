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
  allowTierChange = true,
  onTierChange,
  onWhatsappChange,
}: {
  packages: ServicePackage[]
  serviceTier: ServiceTier
  ownerWhatsapp: string
  whatsappGatewayOpen: boolean
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
        <FieldLabel htmlFor="review-tier">Paket</FieldLabel>
        <Select
          disabled={!allowTierChange}
          id="review-tier"
          onChange={(event) => onTierChange(event.target.value as ServiceTier)}
          value={serviceTier}
        >
          {selectable.map((item) => (
            <option
              disabled={
                !packageAvailable(item.serviceTier, whatsappGatewayOpen) &&
                item.serviceTier !== serviceTier
              }
              key={item.serviceTier}
              value={item.serviceTier}
            >
              {item.name}
            </option>
          ))}
        </Select>
        <FieldDescription>
          Tamu hanya nulis review. Nomor owner untuk tindak lanjut, bukan isian tamu.
        </FieldDescription>
      </Field>
      {proOffline ? (
        <p className="text-sm text-muted-foreground">
          WhatsApp platform belum OPEN. Tamu Pro sementara ke Google Review.
          Ganti paket atau nyalakan gateway.
        </p>
      ) : !whatsappGatewayOpen ? (
        <p className="text-sm text-muted-foreground">
          Paket Pro tidak ditawarkan. WhatsApp platform belum OPEN.
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
            WhatsApp owner (tindak lanjut)
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
              ? 'Sistem kirim isi form ke nomor ini. Tamu tidak melihatnya.'
              : 'Rating rendah membuka chat ke nomor ini. Tamu tidak mengetik nomor.'}
          </FieldDescription>
        </Field>
      ) : null}
    </div>
  )
}
