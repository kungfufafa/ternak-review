import { createFileRoute, Link } from '@tanstack/react-router'
import { AffiliateBenefits } from '#/components/marketing/affiliate/AffiliateBenefits'
import { AFFILIATE_PHOTO_SRC } from '#/components/marketing/affiliate/content'
import { AffiliateForm } from '#/components/marketing/affiliate/AffiliateForm'
import { AffiliateHero } from '#/components/marketing/affiliate/AffiliateHero'
import { marketingHead } from '#/components/marketing/content'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { SiteFooter } from '#/components/marketing/SiteFooter'
import { SiteHeader } from '#/components/marketing/SiteHeader'
import { getPublicSiteFlagsFn } from '#/server/functions'

export const Route = createFileRoute('/affiliate')({
  loader: () => getPublicSiteFlagsFn(),
  component: AffiliatePage,
  head: ({ loaderData }) => {
    const head = marketingHead(
      'Gabung Affiliate Ternak Review — Komisi 20% Tiap Closing',
      'Daftar jadi affiliate Ternak Review, share link ke followers kamu dan dapetin komisi 20% tiap ada yang closing. Gratis, tanpa modal, tanpa perlu stok.',
    )
    if (loaderData && !loaderData.affiliateEnabled) {
      return {
        ...head,
        meta: [
          ...head.meta,
          { name: 'robots', content: 'noindex, nofollow' },
        ],
      }
    }
    return head
  },
})

function AffiliatePage() {
  const flags = Route.useLoaderData()
  if (!flags.affiliateEnabled) {
    return (
      <MarketingShell>
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-24 text-center">
          <h1 className="text-2xl font-bold tracking-wide">
            Program affiliate ditutup
          </h1>
          <p className="mt-3 text-muted-foreground">
            Pendaftaran affiliate sedang tidak dibuka. Fokus kami dulu di kartu
            review.
          </p>
          <Link className="mt-6 underline underline-offset-4" to="/kontak">
            Hubungi kami
          </Link>
        </main>
        <SiteFooter />
      </MarketingShell>
    )
  }

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
