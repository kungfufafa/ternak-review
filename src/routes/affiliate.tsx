import { createFileRoute } from '@tanstack/react-router'
import { AffiliateBenefits } from '#/components/marketing/affiliate/AffiliateBenefits'
import { AFFILIATE_PHOTO_SRC } from '#/components/marketing/affiliate/content'
import { AffiliateForm } from '#/components/marketing/affiliate/AffiliateForm'
import { AffiliateHero } from '#/components/marketing/affiliate/AffiliateHero'
import { marketingHead } from '#/components/marketing/content'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { SiteFooter } from '#/components/marketing/SiteFooter'
import { SiteHeader } from '#/components/marketing/SiteHeader'

export const Route = createFileRoute('/affiliate')({
  component: AffiliatePage,
  head: () =>
    marketingHead(
      'Gabung Affiliate Ternak Review — Komisi 20% Tiap Closing',
      'Daftar jadi affiliate Ternak Review, share link ke followers kamu dan dapetin komisi 20% tiap ada yang closing. Gratis, tanpa modal, tanpa perlu stok.',
    ),
})

function AffiliatePage() {
  return (
    <MarketingShell>
      <SiteHeader />
      <section className="aff-shell">
        <div className="aff-frame">
          <img
            className="aff-photo"
            src={AFFILIATE_PHOTO_SRC}
            alt=""
            aria-hidden="true"
          />
          <div className="aff-scrim" />
          <div className="aff-grid">
            <AffiliateHero />
            <AffiliateForm />
          </div>
        </div>
      </section>
      <AffiliateBenefits />
      <SiteFooter />
    </MarketingShell>
  )
}
