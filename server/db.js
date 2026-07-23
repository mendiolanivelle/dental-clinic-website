import pg from 'pg'
import { databaseClientOptions } from './db-options.js'

const { Pool } = pg

export function createDatabase(config) {
  const pool = new Pool({
    ...databaseClientOptions(config.databaseUrl),
    max: 10,
    idleTimeoutMillis: 30_000,
  })

  return {
    query: (text, values) => pool.query(text, values),
    async transaction(work) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await work(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}
