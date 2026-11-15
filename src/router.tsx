import * as Sentry from '@sentry/tanstackstart-react'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'
import {
  sentryDataCollection,
  sentryDsn,
  sentryEnvironment,
  sentryTracesSampleRate,
} from './lib/sentry-config'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Errors the router's own boundary catches never reach window.onerror,
    // so Sentry only hears about them from here.
    defaultOnCatch: (error) => {
      Sentry.captureException(error)
    },
  })

  if (!router.isServer && sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: sentryEnvironment,
      integrations: [
        Sentry.tanstackRouterBrowserTracingIntegration(router),
        // Replay masks all text and inputs and blocks media by default.
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: sentryTracesSampleRate,
      // Record 10% of sessions, plus every session that hits an error.
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      dataCollection: sentryDataCollection,
    })
  }

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
