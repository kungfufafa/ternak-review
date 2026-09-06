import { getRouteApi, Link } from '@tanstack/react-router'

const rootRoute = getRouteApi('__root__')

export function AnnounceBar() {
  const flags = rootRoute.useLoaderData()
  if (!flags.affiliateEnabled) return null
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
