import { existsSync } from 'node:fs'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { migrate } from './migrate.js'

if (existsSync('.env')) process.loadEnvFile('.env')

const config = loadConfig()
await migrate(config.databaseUrl)
const app = await buildApp({ config })

const shutdown = async () => {
  await app.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await app.listen({ host: '0.0.0.0', port: config.port })
