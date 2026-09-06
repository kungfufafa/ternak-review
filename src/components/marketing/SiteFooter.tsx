import { getRouteApi, Link } from '@tanstack/react-router'
import { footerLinks } from '#/components/marketing/content'
import { Wordmark } from '#/components/marketing/Wordmark'

const rootRoute = getRouteApi('__root__')

export function SiteFooter() {
  const flags = rootRoute.useLoaderData()
  const links = footerLinks.filter(
    (link) => !link.affiliate || flags.affiliateEnabled,
  )
  return (
    <footer>
      <div className="wrap">
        <div className="footer-logo">
          <Wordmark />
        </div>
        <div className="footer-links">
          {links.map((link) => (
            <Link
              className={link.affiliate ? 'footer-link-affiliate' : undefined}
              key={link.href}
              to={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="footer-copy">
          © {new Date().getFullYear()} Ternak Review. Seluruh hak cipta dilindungi.
        </div>
      </div>
    </footer>
  )
}
