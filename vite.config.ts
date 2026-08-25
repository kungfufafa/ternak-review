import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const deployTarget = process.env.DEPLOY_TARGET ?? 'local'
const isCloudflare = deployTarget === 'cloudflare'
const isNode = deployTarget === 'node'
const resolvedTarget = isCloudflare ? 'cloudflare' : isNode ? 'node' : 'local'

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
  const plugins: PluginOption[] = isCloudflare
    ? [...extras, devtools(), tailwindcss(), tanstackStart(), viteReact()]
    : isNode
      ? [devtools(), tailwindcss(), tanstackStart(), ...extras, viteReact()]
      : [devtools(), tailwindcss(), tanstackStart(), viteReact()]

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
            external: ['better-sqlite3'],
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
