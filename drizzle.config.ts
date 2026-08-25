import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { resolveSqliteFilePath } from './src/db/url.ts'

config({ path: ['.env.local', '.env'] })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveSqliteFilePath(),
  },
})
