/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEPLOY_TARGET?: 'local' | 'cloudflare' | 'node'
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
