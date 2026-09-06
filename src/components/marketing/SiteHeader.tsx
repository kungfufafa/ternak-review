import { getRouteApi, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { MenuIcon } from '#/components/marketing/icons'
import { Wordmark } from '#/components/marketing/Wordmark'

const rootRoute = getRouteApi('__root__')

export function SiteHeader() {
  const flags = rootRoute.useLoaderData()
  const [menuOpen, setMenuOpen] = useState(false)
  const homeTo = flags.homeEnabled ? '/' : '/login'

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <nav>
      <div className="nav-inner">
        <div className="nav-links">
          {flags.homeEnabled ? (
            <>
              <Link hash="produk" to="/">
                Produk
              </Link>
              <Link hash="cara-kerja" to="/">
                Cara Kerja
              </Link>
              <Link hash="faq" to="/">
                FAQ
              </Link>
            </>
          ) : null}
        </div>
        <Link aria-label="Ternak Review" className="logo" to={homeTo}>
          <Wordmark />
        </Link>
        <div className="nav-right">
          {flags.affiliateEnabled ? (
            <Link className="nav-link-affiliate" to="/affiliate">
              Affiliate
            </Link>
          ) : null}
          {flags.homeEnabled ? (
            <Link className="nav-cta" hash="produk" to="/">
              Cek paketnya
            </Link>
          ) : (
            <Link className="nav-cta" to="/login">
              Masuk
            </Link>
          )}
          <button
            type="button"
            className="nav-burger"
            aria-label="Buka menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>
      <div className={menuOpen ? 'nav-mobile-menu open' : 'nav-mobile-menu'}>
        {flags.homeEnabled ? (
          <>
            <Link hash="produk" onClick={closeMenu} to="/">
              Produk
            </Link>
            <Link hash="cara-kerja" onClick={closeMenu} to="/">
              Cara Kerja
            </Link>
            <Link hash="faq" onClick={closeMenu} to="/">
              FAQ
            </Link>
          </>
        ) : null}
        {flags.affiliateEnabled ? (
          <Link
            className="nav-link-affiliate"
            onClick={closeMenu}
            to="/affiliate"
          >
            Jadi Affiliate (Komisi 20%)
          </Link>
        ) : null}
        {flags.homeEnabled ? (
          <Link hash="produk" onClick={closeMenu} to="/">
            Cek paketnya
          </Link>
        ) : (
          <Link onClick={closeMenu} to="/login">
            Masuk
          </Link>
        )}
      </div>
    </nav>
  )
}
