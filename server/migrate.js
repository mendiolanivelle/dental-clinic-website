import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { databaseClientOptions } from './db-options.js'

const { Client } = pg
const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))
export const portalTableNames = [
  'patients',
  'dentists',
  'appointment_types',
  'appointments',
  'appointment_requests',
  'treatment_plans',
  'clinical_records',
  'login_challenges',
  'portal_sessions',
  'staff_profiles',
  'staff_sessions',
  'patient_charges',
  'patient_payments',
  'prescriptions',
  'follow_up_recommendations',
  'audit_events',
  'social_brand_settings',
  'social_page_connections',
  'social_posts',
  'social_post_consents',
  'social_post_events',
]

export const migrationBootstrapSql = `
  CREATE SCHEMA IF NOT EXISTS dental_portal;
  CREATE TABLE IF NOT EXISTS dental_portal.schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`

export async function readMigrations() {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(path.join(migrationsDirectory, name), 'utf8')
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    }),
  )
}

export async function migrate(databaseUrl) {
  const client = new Client(databaseClientOptions(databaseUrl))
  await client.connect()
  try {
    await client.query(migrationBootstrapSql)
    const appliedRows = await client.query(
      'SELECT name, checksum FROM dental_portal.schema_migrations',
    )
    const applied = new Map(
      appliedRows.rows.map((row) => [row.name, row.checksum]),
    )

    if (!applied.has('001_patient_portal.sql')) {
      const collisions = await client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = ANY($1::text[])
         ORDER BY table_name`,
        [portalTableNames],
      )
      if (collisions.rowCount) {
        throw new Error(
          `Refusing to move existing public tables: ${collisions.rows
            .map((row) => row.table_name)
            .join(', ')}`,
        )
      }
    }

    for (const { name, sql, checksum } of await readMigrations()) {
      const existingChecksum = applied.get(name)
      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(`Applied migration ${name} has changed`)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query('SET LOCAL search_path TO dental_portal, public')
        await client.query(sql)
        await client.query(
          `INSERT INTO dental_portal.schema_migrations (name, checksum)
           VALUES ($1, $2)`,
          [name, checksum],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const databaseUrl =
    process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required')
  }
  await migrate(databaseUrl)
}
