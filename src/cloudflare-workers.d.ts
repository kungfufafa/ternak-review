declare module 'cloudflare:workers' {
  export const env: {
    DB?: import('drizzle-orm/d1').AnyD1Database
    APP_URL?: string
    AUTH_SECRET?: string
    IP_HASH_SALT?: string
    ADMIN_SETUP_TOKEN?: string
    TRUST_PROXY?: string
    GOOGLE_MAPS_API_KEY?: string
    AFFILIATE_WEBHOOK_URL?: string
    WHATSAPP_GATEWAY_TOKEN?: string
    NODE_ENV?: string
  }
}
