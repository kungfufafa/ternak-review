import { createFileRoute } from '@tanstack/react-router'
import { count, sql } from 'drizzle-orm'
import { db } from '#/db'
import { owners } from '#/db/schema'
import { getDeployTarget } from '#/lib/deploy-target'
import { assertProductionConfig } from '#/lib/env'
import { isGooglePlacesConfigured } from '#/server/google'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.select({ ok: sql<number>`1` })
          assertProductionConfig()
          await db.select({ total: count() }).from(owners)
          return Response.json({
            ok: true,
            service: 'review-kit',
            target: getDeployTarget(),
            googlePlaces: await isGooglePlacesConfigured(),
            ts: new Date().toISOString(),
          })
        } catch (error) {
          console.error(
            '[health]',
            error instanceof Error ? error.message : 'Health check gagal',
          )
          return Response.json(
            {
              ok: false,
              service: 'review-kit',
              target: getDeployTarget(),
              ts: new Date().toISOString(),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
