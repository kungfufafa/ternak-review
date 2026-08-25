import { Link } from '@tanstack/react-router'
import { footerLinks } from '#/components/marketing/content'
import { Wordmark } from '#/components/marketing/Wordmark'

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="footer-logo">
          <Wordmark />
        </div>
        <div className="footer-links">
          {footerLinks.map((link) => (
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
