import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { loadConfig } from '../server/config.js'
import { databaseClientOptions } from '../server/db-options.js'
import { readMigrations } from '../server/migrate.js'
import { migrateSupabase } from '../scripts/migrate-supabase.js'

const productionEnv = (databaseUrl) => ({
  NODE_ENV: 'production',
  PORT: '3000',
  PUBLIC_ORIGIN: 'https://dental.test',
  DATABASE_URL: databaseUrl,
  SESSION_PEPPER: 'a'.repeat(64),
})

test('Supabase database options pin its CA, strip URL SSL overrides, and set the private search path', () => {
  const options = databaseClientOptions(
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require',
  )
  const url = new URL(options.connectionString)
  assert.equal(url.searchParams.has('sslmode'), false)
  assert.equal(options.options, '-c search_path=dental_portal,public')
  assert.equal(options.ssl.rejectUnauthorized, true)
  const certificate = new X509Certificate(options.ssl.ca)
  assert.match(certificate.subject, /Supabase Root 2021 CA/)
  assert.equal(certificate.ca, true)

  const pooler = databaseClientOptions(
    'postgres://postgres.abcdefghijklmnopqrst:secret@aws-0-test.pooler.supabase.com:5432/postgres',
  )
  assert.equal(pooler.ssl.rejectUnauthorized, true)

  const local = databaseClientOptions(
    'postgres://dental:secret@127.0.0.1:5432/dental',
  )
  assert.equal(local.ssl, undefined)
  assert.equal(local.options, '-c search_path=dental_portal,public')
})

test('the backend role stays least-privilege and the forward migration removes OTP data', async () => {
  const securitySql = await readFile(
    new URL('../migrations/002_supabase_security.sql', import.meta.url),
    'utf8',
  )
  const removalSql = await readFile(
    new URL('../migrations/003_remove_sms_otp.sql', import.meta.url),
    'utf8',
  )
  const bookingSql = await readFile(
    new URL('../migrations/004_appointment_requests.sql', import.meta.url),
    'utf8',
  )
  const compact = securitySql.replace(/\s+/g, ' ')

  assert.doesNotMatch(securitySql, /\bDELETE\b/)
  assert.doesNotMatch(compact, /GRANT [^;]* ON ALL TABLES/i)
  assert.match(
    compact,
    /GRANT SELECT ON dental_portal\.patients,[^;]*dental_portal\.clinical_records TO dental_portal_backend;/,
  )
  assert.match(
    compact,
    /GRANT SELECT, INSERT, UPDATE ON dental_portal\.login_challenges, dental_portal\.portal_sessions TO dental_portal_backend;/,
  )
  assert.match(
    compact,
    /GRANT INSERT ON dental_portal\.audit_events TO dental_portal_backend;/,
  )
  assert.doesNotMatch(compact, /GRANT [^;]*schema_migrations/i)

  assert.match(
    removalSql,
    /DROP TABLE IF EXISTS dental_portal\.login_challenges\s*;/,
  )
  assert.doesNotMatch(removalSql, /\bCASCADE\b/i)
  assert.doesNotMatch(removalSql, /\bpublic\./i)
  assert.doesNotMatch(removalSql, /DROP TABLE[^;]*portal_sessions/i)
  assert.match(
    bookingSql,
    /CREATE TABLE IF NOT EXISTS appointment_requests[\s\S]*status text NOT NULL DEFAULT 'requested'/i,
  )
  assert.match(bookingSql, /GRANT SELECT, INSERT ON dental_portal\.appointment_requests TO dental_portal_backend;/i)
  assert.match(bookingSql, /ENABLE ROW LEVEL SECURITY[\s\S]*appointment_requests/i)
})

test('production permits Supabase direct/session connections and rejects other hosts or transaction pooling', () => {
  assert.doesNotThrow(() =>
    loadConfig(
      productionEnv(
        'postgres://dental_portal_app:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
      ),
    ),
  )
  assert.doesNotThrow(() =>
    loadConfig(
      productionEnv(
        'postgres://dental_portal_app.abcdefghijklmnopqrst:secret@aws-0-test.pooler.supabase.com:5432/postgres',
      ),
    ),
  )
  assert.throws(
    () =>
      loadConfig(
        productionEnv(
          'postgres://postgres.abcdefghijklmnopqrst:secret@aws-0-test.pooler.supabase.com:5432/postgres',
        ),
      ),
    /least-privilege dental_portal_app role/,
  )
  assert.throws(
    () =>
      loadConfig(
        productionEnv('postgres://postgres:secret@database.test:5432/postgres'),
      ),
    /Supabase database host/,
  )
  assert.throws(
    () =>
      loadConfig(
        productionEnv(
          'postgres://postgres.abcdefghijklmnopqrst:secret@aws-0-test.pooler.supabase.com:6543/postgres',
        ),
      ),
    /port 5432/,
  )
})

test('Management API migrations are ordered, checksummed, and never place the access token in SQL', async () => {
  const calls = []
  const fetchFn = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 201,
      text: async () => '[]',
    }
  }
  const token = 'test-management-token'
  const appliedCount = await migrateSupabase({
    env: {
      SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
      SUPABASE_ACCESS_TOKEN: token,
    },
    fetchFn,
  })
  const migrations = await readMigrations()

  assert.equal(appliedCount, migrations.length)
  assert.equal(calls.length, migrations.length + 2)
  assert.equal(calls[0].options.headers.authorization, `Bearer ${token}`)
  const bootstrap = JSON.parse(calls[0].options.body).query
  assert.match(bootstrap, /dental_portal\.schema_migrations/)
  assert.doesNotMatch(bootstrap, /public\.schema_migrations/)
  assert.match(
    JSON.parse(calls[1].options.body).query,
    /information_schema\.tables/,
  )
  const migrationQueries = calls
    .slice(2)
    .map((call) => JSON.parse(call.options.body).query)
  assert.ok(
    migrationQueries.some((query) => /ENABLE ROW LEVEL SECURITY/.test(query)),
  )
  const removalQuery = migrationQueries.find((query) => query.includes('DROP TABLE IF EXISTS dental_portal.login_challenges'))
  const bookingQuery = migrationQueries.find((query) => query.includes('CREATE TABLE IF NOT EXISTS appointment_requests'))
  assert.ok(removalQuery)
  assert.ok(bookingQuery)
  for (const call of calls) {
    assert.equal(call.options.body.includes(token), false)
  }
})

test('Management API migration validation fails before making a request', async () => {
  let called = false
  await assert.rejects(
    migrateSupabase({
      env: {
        SUPABASE_PROJECT_REF: 'invalid',
        SUPABASE_ACCESS_TOKEN: 'test-management-token',
      },
      fetchFn: async () => {
        called = true
      },
    }),
    /20-letter project reference/,
  )
  assert.equal(called, false)
})

test('Management API migration refuses public table-name collisions', async () => {
  let call = 0
  await assert.rejects(
    migrateSupabase({
      env: {
        SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        SUPABASE_ACCESS_TOKEN: 'test-management-token',
      },
      fetchFn: async () => ({
        ok: true,
        status: 201,
        text: async () =>
          call++ === 0 ? '[]' : '[{"table_name":"patients"}]',
      }),
    }),
    /Refusing to move existing public tables: patients/,
  )
  assert.equal(call, 2)
})

test('demo seed requires an explicit override for every Supabase database', () => {
  const result = spawnSync(process.execPath, ['scripts/seed-demo.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      DATABASE_URL:
        'postgresql://dental_portal_app:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
      ALLOW_PRODUCTION_DEMO_SEED: '',
    },
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Demo seed is disabled for production or Supabase/)
})
