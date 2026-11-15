import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const deployTarget = process.env.DEPLOY_TARGET ?? 'local'
const isCloudflare = deployTarget === 'cloudflare'
const isNode = deployTarget === 'node'
const resolvedTarget = isCloudflare ? 'cloudflare' : isNode ? 'node' : 'local'

// The minifier turns the quotes around Sentry's debug ID into backticks. The
// Sentry CLI then fails to recognise its own snippet in the copy it uploads,
// adds a second one on a new first line and shifts the uploaded source map
// by that line, so browser stack traces stop resolving. Putting the quotes
// back changes no length, so the source map stays valid. Keep it before the
// Sentry plugin, whose upload step reads the result.
const keepSentryDebugIdQuotes: PluginOption = {
  name: 'keep-sentry-debug-id-quotes',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue
      output.code = output.code.replace(
        /(_sentryDebugIds\[[$\w]+\]=)`([0-9a-f-]{36})`/g,
        '$1"$2"',
      )
    }
  },
}

async function extraPlugins(): Promise<PluginOption[]> {
  if (isCloudflare) {
    const { cloudflare } = await import('@cloudflare/vite-plugin')
    return [cloudflare({ viteEnvironment: { name: 'ssr' } })]
  }
  if (isNode) {
    const { nitro } = await import('nitro/vite')
    return [nitro()]
  }
  return []
}

const config = defineConfig(async () => {
  const extras = await extraPlugins()
  // Traces the Start middlewares, and uploads source maps to Sentry when
  // SENTRY_AUTH_TOKEN is set at build time. Must stay last.
  const sentry: PluginOption[] = [
    keepSentryDebugIdQuotes,
    sentryTanstackStart({
      org: 'developer-hof',
      project: 'ternak-review',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    }),
  ]
  const plugins: PluginOption[] = isCloudflare
    ? [...extras, devtools(), tailwindcss(), tanstackStart(), viteReact(), ...sentry]
    : isNode
      ? [devtools(), tailwindcss(), tanstackStart(), ...extras, viteReact(), ...sentry]
      : [devtools(), tailwindcss(), tanstackStart(), viteReact(), ...sentry]

  return {
    resolve: {
      tsconfigPaths: true,
      alias: {
        '#db-runtime': path.resolve(
          root,
          isCloudflare ? 'src/db/d1.ts' : 'src/db/sqlite.ts',
        ),
        ...(isCloudflare
          ? {}
          : {
              'cloudflare:workers': path.resolve(
                root,
                'src/lib/cloudflare-env-stub.ts',
              ),
            }),
      },
    },
    define: {
      'import.meta.env.DEPLOY_TARGET': JSON.stringify(resolvedTarget),
    },
    plugins,
    optimizeDeps: {
      exclude: isCloudflare ? [] : ['better-sqlite3'],
    },
    ...(isCloudflare
      ? {}
      : {
          ssr: {
            external: ['better-sqlite3', 'nodemailer'],
          },
        }),
    server: {
      watch: {
        ignored: ['**/data/**', '**/.wrangler/**', '**/backups/**'],
      },
    },
  }
})

export default config
