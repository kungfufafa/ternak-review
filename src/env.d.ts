/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEPLOY_TARGET?: 'local' | 'cloudflare' | 'node'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
