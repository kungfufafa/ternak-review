import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Button } from '../components/ui/button'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import { getPublicSiteFlagsFn } from '#/server/functions'

interface MyRouterContext {
  queryClient: QueryClient
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  loader: () => getPublicSiteFlagsFn(),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Ternak Review',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '64x64',
        href: '/favicon.png',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  const flags = Route.useLoaderData()
  const homeTo = flags.homeEnabled ? '/' : '/login'
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col items-center px-6 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-3 text-2xl font-bold tracking-wide">
        Tidak ditemukan
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        URL ini tidak ada. Kembali ke beranda atau aktivasi unit.
      </p>
      <Button asChild className="mt-6 w-full">
        <Link to={homeTo}>{flags.homeEnabled ? 'Beranda' : 'Masuk'}</Link>
      </Button>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isMarketing =
    pathname === '/' ||
    pathname === '/affiliate' ||
    pathname === '/kebijakan-privasi' ||
    pathname === '/syarat-ketentuan' ||
    pathname === '/kebijakan-refund' ||
    pathname === '/kontak'

  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {isMarketing ? null : (
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        )}
        <HeadContent />
      </head>
      <body
        className={
          isMarketing
            ? 'min-h-svh antialiased [overflow-wrap:anywhere]'
            : 'flex min-h-svh flex-col bg-background font-sans text-foreground antialiased [overflow-wrap:anywhere]'
        }
      >
        <div className="flex-1">{children}</div>
        {isMarketing ? null : (
          <div className="print-hide">
            <TanStackDevtools
              config={{
                position: 'bottom-right',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
              ]}
            />
          </div>
        )}
        <Scripts />
      </body>
    </html>
  )
}
