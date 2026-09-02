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
  GOOGLE_DRIVE_PRESCRIPTIONS_FOLDER_ID: 'test-folder',
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify({
    client_email: 'test@example.iam.gserviceaccount.com',
    private_key: 'test-private-key',
    token_uri: 'https://oauth2.googleapis.com/token',
  })).toString('base64'),
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
  const scheduleSql = await readFile(
    new URL('../migrations/005_hourly_dentist_slots.sql', import.meta.url),
    'utf8',
  )
  const receptionSql = await readFile(
    new URL('../migrations/006_reception_portal.sql', import.meta.url),
    'utf8',
  )
  const storeSql = await readFile(
    new URL('../server/store.js', import.meta.url),
    'utf8',
  )
  const patientAccountSql = await readFile(
    new URL('../migrations/007_reception_patient_accounts.sql', import.meta.url),
    'utf8',
  )
  const demographicsSql = await readFile(
    new URL('../migrations/008_patient_demographics.sql', import.meta.url),
    'utf8',
  )
  const paymentsSql = await readFile(
    new URL('../migrations/009_patient_payments.sql', import.meta.url),
    'utf8',
  )
  const vitalsSql = await readFile(
    new URL('../migrations/010_patient_vitals.sql', import.meta.url),
    'utf8',
  )
  const checkoutRecordsSql = await readFile(
    new URL('../migrations/011_checkout_clinical_records.sql', import.meta.url),
    'utf8',
  )
  const dentistPortalSql = await readFile(
    new URL('../migrations/012_dentist_portal.sql', import.meta.url),
    'utf8',
  )
  const patientPhoneSql = await readFile(
    new URL('../migrations/013_patient_phone_self_service.sql', import.meta.url),
    'utf8',
  )
  const staffNameLoginSql = await readFile(
    new URL('../migrations/014_staff_name_login.sql', import.meta.url),
    'utf8',
  )
  const superAdminSql = await readFile(
    new URL('../migrations/015_super_admin_portal.sql', import.meta.url),
    'utf8',
  )
  const staffWritePoliciesSql = await readFile(
    new URL('../migrations/016_staff_profile_write_policies.sql', import.meta.url),
    'utf8',
  )
  const registeredDentistsSql = await readFile(
    new URL('../migrations/017_registered_dentists_only.sql', import.meta.url),
    'utf8',
  )
  const visitCompletionSql = await readFile(
    new URL('../migrations/018_dentist_visit_completion.sql', import.meta.url),
    'utf8',
  )
  const confirmedFollowUpSql = await readFile(
    new URL('../migrations/021_confirmed_follow_up_scheduling.sql', import.meta.url),
    'utf8',
  )
  const socialPublishingSql = await readFile(
    new URL('../migrations/022_social_publishing.sql', import.meta.url),
    'utf8',
  )
  const socialTemplatesSql = await readFile(
    new URL('../migrations/023_social_brand_templates.sql', import.meta.url),
    'utf8',
  )
  const socialPromptsSql = await readFile(
    new URL('../migrations/025_social_custom_prompts.sql', import.meta.url),
    'utf8',
  )
  const paperSocialConsentSql = await readFile(
    new URL('../migrations/026_paper_social_consent.sql', import.meta.url),
    'utf8',
  )
  const adminAuditReadSql = await readFile(
    new URL('../migrations/023_admin_audit_read.sql', import.meta.url),
    'utf8',
  )
  const doctorNameTitlesSql = await readFile(
    new URL('../migrations/024_doctor_name_titles.sql', import.meta.url),
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
  assert.match(vitalsSql, /ADD COLUMN weight_kg numeric\(5, 2\)/)
  assert.match(vitalsSql, /blood_pressure_systolic > blood_pressure_diastolic/)
  assert.match(vitalsSql, /GRANT UPDATE \([\s\S]*weight_kg[\s\S]*\) ON dental_portal\.patients TO dental_portal_backend;/)
  assert.match(checkoutRecordsSql, /SECURITY DEFINER/)
  assert.match(checkoutRecordsSql, /REVOKE ALL ON FUNCTION dental_portal\.publish_checkout_record\(\) FROM PUBLIC/)
  assert.match(checkoutRecordsSql, /AFTER INSERT ON dental_portal\.patient_charges/)
  assert.match(checkoutRecordsSql, /INSERT INTO dental_portal\.clinical_records[\s\S]*FROM dental_portal\.patient_charges charge/)
  assert.doesNotMatch(checkoutRecordsSql, /GRANT[^;]*clinical_records/i)

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
  assert.match(scheduleSql, /ADD COLUMN IF NOT EXISTS dentist_id uuid REFERENCES dentists\(id\)/i)
  assert.match(scheduleSql, /requested_end_at = requested_start_at \+ interval '1 hour'/i)
  assert.match(scheduleSql, /INSERT INTO dentists[\s\S]*Dr\. Amara Villanueva[\s\S]*Dr\. Mateo Rivera[\s\S]*Dr\. Celeste Navarro/i)
  assert.match(scheduleSql, /CREATE UNIQUE INDEX IF NOT EXISTS appointment_requests_dentist_slot_active_idx/i)
  assert.match(receptionSql, /CREATE TABLE IF NOT EXISTS staff_profiles/i)
  assert.match(receptionSql, /CREATE TABLE IF NOT EXISTS staff_sessions/i)
  assert.match(receptionSql, /role IN \('receptionist', 'dentist', 'admin'\)/i)
  assert.match(receptionSql, /GRANT SELECT ON dental_portal\.staff_profiles TO dental_portal_backend/i)
  assert.match(receptionSql, /GRANT SELECT, INSERT, UPDATE ON dental_portal\.appointments TO dental_portal_backend/i)
  assert.doesNotMatch(receptionSql, /GRANT[^;]*clinical_records/i)
  assert.doesNotMatch(receptionSql, /\bDELETE\b/i)
  assert.match(storeSql, /WHERE \$4::timestamptz > \$7::timestamptz/)
  assert.match(patientAccountSql, /ALTER COLUMN phone_e164 DROP NOT NULL/i)
  assert.match(patientAccountSql, /GRANT INSERT ON dental_portal\.patients TO dental_portal_backend/i)
  assert.match(demographicsSql, /ADD COLUMN IF NOT EXISTS age integer/i)
  assert.match(demographicsSql, /gender IN \('female', 'male', 'non_binary', 'prefer_not_to_say'\)/i)
  assert.match(paymentsSql, /CREATE TABLE IF NOT EXISTS patient_charges/i)
  assert.match(paymentsSql, /CREATE TABLE IF NOT EXISTS patient_payments/i)
  assert.match(paymentsSql, /amount_cents integer NOT NULL CHECK \(amount_cents > 0\)/i)
  assert.match(paymentsSql, /status IN \('posted', 'voided'\)/i)
  assert.match(paymentsSql, /GRANT SELECT, INSERT, UPDATE[\s\S]*patient_charges[\s\S]*patient_payments/i)
  assert.doesNotMatch(paymentsSql, /\bDELETE\b/i)
  assert.doesNotMatch(paymentsSql, /card_number|cvv|expiry/i)
  assert.match(dentistPortalSql, /ADD COLUMN dentist_id uuid REFERENCES dental_portal\.dentists\(id\)/i)
  assert.match(dentistPortalSql, /CREATE TABLE dental_portal\.prescriptions/i)
  assert.match(dentistPortalSql, /image_byte_size integer NOT NULL CHECK \(image_byte_size BETWEEN 1 AND 5242880\)/i)
  assert.match(dentistPortalSql, /CREATE TABLE dental_portal\.follow_up_recommendations/i)
  assert.match(dentistPortalSql, /GRANT SELECT, INSERT[\s\S]*prescriptions[\s\S]*follow_up_recommendations/i)
  assert.doesNotMatch(dentistPortalSql, /GRANT[^;]*\b(?:anon|authenticated|service_role)\b/i)
  assert.doesNotMatch(dentistPortalSql, /\bDELETE\b/i)
  assert.match(patientPhoneSql, /GRANT UPDATE \(phone_e164, phone_verified_at, updated_at\)/i)
  assert.doesNotMatch(patientPhoneSql, /\bDELETE\b/i)
  assert.match(staffNameLoginSql, /ADD COLUMN normalized_name text/i)
  assert.match(staffNameLoginSql, /CREATE UNIQUE INDEX staff_profiles_normalized_name_unique_idx/i)
  assert.doesNotMatch(staffNameLoginSql, /\bDELETE\b/i)
  assert.match(superAdminSql, /role IN \('receptionist', 'dentist', 'super_admin'\)/i)
  assert.match(superAdminSql, /ADD COLUMN password_hash text/i)
  assert.match(superAdminSql, /GRANT INSERT \([\s\S]*ON dental_portal\.staff_profiles TO dental_portal_backend/i)
  assert.doesNotMatch(superAdminSql, /GRANT[^;]*\b(?:anon|authenticated|service_role)\b/i)
  assert.doesNotMatch(superAdminSql, /\bDELETE\b/i)
  assert.match(staffWritePoliciesSql, /FOR INSERT TO dental_portal_backend[\s\S]*WITH CHECK \(true\)/i)
  assert.match(staffWritePoliciesSql, /FOR UPDATE TO dental_portal_backend[\s\S]*USING \(true\) WITH CHECK \(true\)/i)
  assert.doesNotMatch(staffWritePoliciesSql, /\b(?:anon|authenticated|service_role|DELETE)\b/i)
  assert.match(registeredDentistsSql, /UPDATE dental_portal\.dentists[\s\S]*SET active = false/i)
  assert.match(registeredDentistsSql, /NOT EXISTS[\s\S]*staff_profiles[\s\S]*role = 'dentist'/i)
  assert.doesNotMatch(registeredDentistsSql, /\bDELETE\b/i)
  assert.match(visitCompletionSql, /ADD COLUMN dentist_done_at timestamptz/i)
  assert.match(visitCompletionSql, /ADD COLUMN proposed_fee_cents integer/i)
  assert.match(visitCompletionSql, /appointments_dentist_completion_check/i)
  assert.doesNotMatch(visitCompletionSql, /\bDELETE\b/i)
  assert.match(confirmedFollowUpSql, /appointments_patient_slot_active_idx/i)
  assert.match(confirmedFollowUpSql, /status = 'scheduled', appointment_id = created_appointment_id/i)
  assert.doesNotMatch(confirmedFollowUpSql, /\bDELETE\b/i)
  assert.match(socialPublishingSql, /CREATE TABLE dental_portal\.social_posts/i)
  assert.match(socialPublishingSql, /CREATE TABLE dental_portal\.social_post_consents/i)
  assert.match(socialPublishingSql, /idempotency_key uuid UNIQUE NOT NULL/i)
  assert.match(socialPublishingSql, /ENABLE ROW LEVEL SECURITY/i)
  assert.doesNotMatch(socialPublishingSql, /\bDELETE\b/i)
  assert.doesNotMatch(socialPublishingSql, /GRANT[^;]*\b(?:anon|authenticated|service_role)\b/i)
  assert.match(socialTemplatesSql, /CREATE TABLE dental_portal\.social_brand_templates/i)
  assert.match(socialTemplatesSql, /FORCE ROW LEVEL SECURITY/i)
  assert.match(socialTemplatesSql, /GRANT SELECT, INSERT, DELETE ON dental_portal\.social_brand_templates TO dental_portal_backend/i)
  assert.doesNotMatch(socialTemplatesSql, /GRANT[^;]*\b(?:anon|authenticated|service_role)\b/i)
  assert.match(socialPromptsSql, /ADD COLUMN caption_prompt text NOT NULL DEFAULT ''/i)
  assert.match(socialPromptsSql, /ADD COLUMN image_prompt text NOT NULL DEFAULT ''/i)
  assert.match(paperSocialConsentSql, /ALTER COLUMN patient_id DROP NOT NULL/i)
  assert.match(adminAuditReadSql, /GRANT SELECT ON dental_portal\.audit_events TO dental_portal_backend/i)
  assert.doesNotMatch(adminAuditReadSql, /\b(?:INSERT|UPDATE|DELETE|anon|authenticated|service_role)\b/i)
  assert.match(doctorNameTitlesSql, /UPDATE dental_portal\.staff_profiles[\s\S]*WHERE role = 'dentist'/i)
  assert.match(doctorNameTitlesSql, /UPDATE dental_portal\.dentists/i)
  assert.match(storeSql, /a\.dentist_done_at IS NOT NULL/i)
  assert.match(storeSql, /coalesce\(a\.dentist_done_at, CASE WHEN a\.status = 'completed' THEN a\.starts_at END\)/i)
  assert.match(storeSql, /WHERE c\.created_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)/i)
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
