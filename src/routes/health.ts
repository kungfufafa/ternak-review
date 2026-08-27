import { createFileRoute } from '@tanstack/react-router'
import { count, sql } from 'drizzle-orm'
import { db } from '#/db'
import { owners } from '#/db/schema'
import { getDeployTarget } from '#/lib/deploy-target'
import { assertProductionConfig } from '#/lib/env'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.select({ ok: sql<number>`1` })
          assertProductionConfig()
          const [ownerRow] = await db.select({ total: count() }).from(owners)
          if (Number(ownerRow?.total ?? 0) > 1) {
            throw new Error('Database memiliki lebih dari satu owner')
          }
          return Response.json({
            ok: true,
            service: 'review-kit',
            target: getDeployTarget(),
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
