import { createFileRoute } from '@tanstack/react-router'
import { getAppUrl } from '#/lib/env'
import { getSessionOwner } from '#/server/auth'
import { logClick, resolveRedirect } from '#/server/redirect'
import { getTrustedClientIp } from '#/server/request'

export const Route = createFileRoute('/r/$publicId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const publicId = params.publicId?.toUpperCase() ?? ''
        const session = await getSessionOwner()
        const result = await resolveRedirect(publicId, session?.ownerId)
        const appUrl = getAppUrl()

        if (result.kind === 'not_found') {
          return Response.redirect(`${appUrl}/r-status?state=not_found`, 302)
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
        if (result.kind === 'manage') {
          return Response.redirect(
            `${appUrl}/app/units/${encodeURIComponent(result.unitId)}`,
            302,
          )
        }

        const ua = request.headers.get('user-agent')
        try {
          await logClick({
            unitId: result.unitId,
            userAgent: ua,
            ip: getTrustedClientIp(),
          })
        } catch (err) {
          console.error('[click-log]', err)
        }

        if (result.kind === 'feedback') {
          return Response.redirect(
            `${appUrl}/feedback/${encodeURIComponent(result.publicId)}`,
            302,
          )
        }

        return Response.redirect(result.url, 302)
      },
    },
  },
})
