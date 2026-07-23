import { existsSync } from 'node:fs'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'

if (existsSync('.env')) process.loadEnvFile('.env')

const config = loadConfig()
const app = await buildApp({ config })

const shutdown = async () => {
  await app.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await app.listen({ host: '0.0.0.0', port: config.port })
