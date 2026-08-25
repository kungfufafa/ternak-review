import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeader } from '@tanstack/react-start/server'
import { getAppUrl } from '#/lib/env'
import { resolveNfcRedirect } from '#/server/nfc'
import { logClick } from '#/server/redirect'

function clientIp() {
  const forwarded = getRequestHeader('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return getRequestHeader('x-real-ip') ?? null
}

export const Route = createFileRoute('/n/$nfcId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const nfcId = params.nfcId?.toUpperCase() ?? ''
        const result = await resolveNfcRedirect(nfcId)
        const appUrl = getAppUrl()

        if (result.kind === 'not_found') {
          return Response.redirect(`${appUrl}/r-status?state=not_found`, 302)
        }
        if (result.kind === 'unpaired') {
          return Response.redirect(
            `${appUrl}/r-status?state=unpaired&id=${encodeURIComponent(nfcId)}`,
            302,
          )
        }
        if (result.kind === 'activate') {
          const activateUrl = new URL(`${appUrl}/activate`)
          activateUrl.searchParams.set('id', result.publicId)
          const ref = new URL(request.url).searchParams.get('ref')?.trim()
          if (ref) activateUrl.searchParams.set('ref', ref.slice(0, 80))
          return Response.redirect(activateUrl.toString(), 302)
        }
        if (result.kind === 'inactive') {
          return Response.redirect(
            `${appUrl}/r-status?state=inactive&id=${encodeURIComponent(result.publicId)}`,
            302,
          )
        }

        const ua = request.headers.get('user-agent')
        try {
          await logClick({
            unitId: result.unitId,
            userAgent: ua,
            ip: clientIp(),
          })
        } catch (err) {
          console.error('[click-log]', err)
        }

        return Response.redirect(result.url, 302)
      },
    },
  },
})
