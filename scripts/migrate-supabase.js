import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  migrationBootstrapSql,
  portalTableNames,
  readMigrations,
} from '../server/migrate.js'

const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`

const resultRows = (payload) => {
  if (Array.isArray(payload)) {
    return Array.isArray(payload.at(-1)) ? payload.at(-1) : payload
  }
  return Array.isArray(payload?.result) ? payload.result : []
}

export async function migrateSupabase({
  env = process.env,
  fetchFn = globalThis.fetch,
} = {}) {
  const projectRef = env.SUPABASE_PROJECT_REF?.trim()
  const accessToken = env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!/^[a-z]{20}$/.test(projectRef || '')) {
    throw new Error('SUPABASE_PROJECT_REF must be a 20-letter project reference')
  }
  if (!accessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN is required')
  }

  const runQuery = async (query) => {
    const response = await fetchFn(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      },
    )
    const body = await response.text()
    if (!response.ok) {
      let detail = ''
      try {
        const parsed = JSON.parse(body)
        detail = parsed.message || parsed.error || ''
      } catch {
        detail = body
      }
      throw new Error(
        `Supabase migration request failed with HTTP ${response.status}${
          detail ? `: ${String(detail).slice(0, 500)}` : ''
        }`,
      )
    }
    return resultRows(body ? JSON.parse(body) : [])
  }

  const applied = new Map(
    (
      await runQuery(`
        ${migrationBootstrapSql}
        SELECT name, checksum
        FROM dental_portal.schema_migrations
        ORDER BY name;
      `)
    ).map((row) => [row.name, row.checksum]),
  )

  if (!applied.has('001_patient_portal.sql')) {
    const collisions = await runQuery(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${portalTableNames.map(sqlLiteral).join(', ')})
      ORDER BY table_name;
    `)
    if (collisions.length) {
      throw new Error(
        `Refusing to move existing public tables: ${collisions
          .map((row) => row.table_name)
          .join(', ')}`,
      )
    }
  }

  let appliedCount = 0
  for (const migration of await readMigrations()) {
    const existingChecksum = applied.get(migration.name)
    if (existingChecksum) {
      if (existingChecksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.name} has changed`)
      }
      continue
    }

    await runQuery(`
      BEGIN;
      SET LOCAL search_path TO dental_portal, public;
      ${migration.sql}
      INSERT INTO dental_portal.schema_migrations (name, checksum)
      VALUES (${sqlLiteral(migration.name)}, ${sqlLiteral(migration.checksum)});
      COMMIT;
    `)
    appliedCount += 1
  }

  return appliedCount
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (existsSync('.env')) process.loadEnvFile('.env')
  try {
    const appliedCount = await migrateSupabase()
    console.log(`Applied ${appliedCount} Supabase migration(s).`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
