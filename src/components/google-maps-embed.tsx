export function mapsSearchUrl(input: {
  name: string
  address?: string | null
  placeId?: string | null
}) {
  const query = input.address
    ? `${input.name}, ${input.address}`
    : input.name
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', query)
  if (input.placeId && !input.placeId.startsWith('ChIJ-demo')) {
    url.searchParams.set('query_place_id', input.placeId)
  }
  return url.toString()
}

export function mapsEmbedUrl(input: {
  name: string
  address?: string | null
}) {
  const query = input.address
    ? `${input.name}, ${input.address}`
    : input.name
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&hl=id&z=16&output=embed`
}

export function GoogleMapsEmbed({
  name,
  address,
}: {
  name: string
  address?: string | null
}) {
  return (
    <iframe
      allowFullScreen
      className="h-52 w-full border-0 sm:h-72"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      src={mapsEmbedUrl({ name, address })}
      title={name}
    />
  )
}
