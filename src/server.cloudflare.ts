// Cloudflare Workers entry (wrangler.jsonc `main`). The local and Node targets
// keep TanStack Start's default server entry, so nothing here runs there.
import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler from '@tanstack/react-start/server-entry'
import {
  sentryDataCollection,
  sentryDsn,
  sentryEnvironment,
  sentryTracesSampleRate,
} from '#/lib/sentry-config'

// Sentry otherwise stamps Worker events with the IP of whoever sent them,
// which on Cloudflare is the Worker's own egress address, not the visitor's.
function withoutInferredIp<T extends Sentry.Event>(event: T): T {
  event.sdk = {
    ...event.sdk,
    settings: { ...event.sdk?.settings, infer_ip: 'never' },
  }
  return event
}

export default Sentry.withSentry(
  () => ({
    dsn: sentryDsn,
    environment: sentryEnvironment,
    tracesSampleRate: sentryTracesSampleRate,
    dataCollection: sentryDataCollection,
    beforeSend: withoutInferredIp,
    beforeSendTransaction: withoutInferredIp,
  }),
  wrapFetchWithSentry(handler),
)
