import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { MenuIcon } from '#/components/marketing/icons'
import { Wordmark } from '#/components/marketing/Wordmark'

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <nav>
      <div className="nav-inner">
        <div className="nav-links">
          <Link to="/" hash="produk">
            Produk
          </Link>
          <Link to="/" hash="cara-kerja">
            Cara Kerja
          </Link>
          <Link to="/" hash="faq">
            FAQ
          </Link>
        </div>
        <Link className="logo" to="/" aria-label="Ternak Review">
          <Wordmark />
        </Link>
        <div className="nav-right">
          <Link to="/affiliate" className="nav-link-affiliate">
            Affiliate
          </Link>
          <Link to="/" hash="produk" className="nav-cta">
            Cek paketnya
          </Link>
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
        <Link to="/" hash="produk" onClick={closeMenu}>
          Produk
        </Link>
        <Link to="/" hash="cara-kerja" onClick={closeMenu}>
          Cara Kerja
        </Link>
        <Link to="/" hash="faq" onClick={closeMenu}>
          FAQ
        </Link>
        <Link
          to="/affiliate"
          className="nav-link-affiliate"
          onClick={closeMenu}
        >
          Jadi Affiliate (Komisi 20%)
        </Link>
        <Link to="/" hash="produk" onClick={closeMenu}>
          Cek paketnya
        </Link>
      </div>
    </nav>
  )
}
