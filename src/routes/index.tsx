import { createFileRoute } from '@tanstack/react-router'
import { AnnounceBar } from '#/components/marketing/AnnounceBar'
import { marketingHead } from '#/components/marketing/content'
import { FaqSection } from '#/components/marketing/FaqSection'
import { HeroSection } from '#/components/marketing/HeroSection'
import { HowItWorksSection } from '#/components/marketing/HowItWorksSection'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { ProductsSection } from '#/components/marketing/ProductsSection'
import { SiteFooter } from '#/components/marketing/SiteFooter'
import { SiteHeader } from '#/components/marketing/SiteHeader'

export const Route = createFileRoute('/')({
  component: HomePage,
  head: () =>
    marketingHead(
      'Ternak Review — Modal Rp15.000, Bisa Cuan 10x Lipat',
      'Cara gampang ubah kartu review Google jadi Rp50-165 ribu per closing ke bisnis lokal, plus akses supplier kartu NFC Rp15.000/pcs.',
    ),
})

function HomePage() {
  return (
    <MarketingShell>
      <AnnounceBar />
      <SiteHeader />
      <HeroSection />
      <ProductsSection />
      <HowItWorksSection />
      <FaqSection />
      <SiteFooter />
    </MarketingShell>
  )
}
