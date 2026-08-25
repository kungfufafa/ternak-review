import type { ReactNode } from 'react'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { SiteFooter } from '#/components/marketing/SiteFooter'
import { SiteHeader } from '#/components/marketing/SiteHeader'

export function LegalPage({
  label,
  title,
  updated,
  children,
}: {
  label: string
  title: ReactNode
  updated?: string
  children: ReactNode
}) {
  return (
    <MarketingShell>
      <SiteHeader />
      <section className="legal">
        <div className="wrap">
          <div className="section-label">{label}</div>
          <h1 className="section-title">{title}</h1>
          {updated ? (
            <p className="legal-updated">Terakhir diperbarui: {updated}</p>
          ) : null}
          <div className="legal-body">{children}</div>
        </div>
      </section>
      <SiteFooter />
    </MarketingShell>
  )
}
