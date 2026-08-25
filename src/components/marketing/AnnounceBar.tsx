import { Link } from '@tanstack/react-router'

export function AnnounceBar() {
  return (
    <Link className="announce-bar" to="/affiliate">
      <span className="announce-full">
        Program Affiliate — komisi 20% tiap closing
      </span>
      <span className="announce-short">Affiliate · komisi 20%</span>
      <span className="arrow">Daftar sekarang →</span>
    </Link>
  )
}
