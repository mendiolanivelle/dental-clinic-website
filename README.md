# SmileCare Dental Patient Portal

A React, Vite, Tailwind CSS, Fastify, and PostgreSQL patient portal. Production
uses Supabase-hosted PostgreSQL while Fastify remains the only API and
authentication boundary. Patients use their clinic-issued patient ID and full
name, then verify with a one-time code. The first release is read-only.

> Use fictional records only until every release gate below is complete. A
> name and patient ID alone must never grant access to patient information.

## Local development

Requirements:

- Node.js 22
- PostgreSQL

Create a local database and environment file:

```bash
createuser --createdb --createrole --pwprompt dental_portal
createdb --owner=dental_portal dental_portal
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Use a local-only password for `dental_portal`, put it in `.env`'s
`DATABASE_URL`, and put the two generated values in `SESSION_PEPPER` and
`OTP_PEPPER`. The local role needs `CREATEROLE` only because it owns and applies
the development migration; production uses separate administrator and runtime
credentials.

Install, migrate, seed fictional demo data, and start the application:

```bash
npm ci
npm run migrate
npm run seed:demo
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000). Development SMS delivery
is permitted only with fictional data; never place a real phone number,
patient record, database dump, screenshot, or access code in Git or logs.

Use the fictional seeded patient:

```text
Full name: Patricia Portal Demo
Patient ID: PT-DEMO01
Verification code: 123456
```

`DEV_OTP_CODE` is for local fictional-data testing only and is rejected when
`NODE_ENV=production`.

## Verification

Run these before every deployment:

```bash
npm test
npm run build
```

The production server must also pass:

```bash
curl --fail http://127.0.0.1:3000/api/health
```

## Supabase database and Coolify deployment

1. Use the Supabase dashboard's **Connect** dialog to copy the Supavisor
   **session mode** connection details. A persistent Coolify container must use
   session mode on port `5432`, not transaction mode on port `6543`.
2. From a trusted administrator machine, apply migrations before deploying:

   ```bash
   SUPABASE_PROJECT_REF=<project-ref> \
   SUPABASE_ACCESS_TOKEN=<temporary-access-token> \
   npm run migrate:supabase
   ```

   These two values authorize one-time migration tooling only. Remove them from
   the shell afterward. Never put the access token in Coolify, React/Vite
   variables, a runtime `.env`, Git, or logs. Application startup does not run
   database migrations. The migration creates the non-login
   `dental_portal_backend` privilege role. In a trusted administrative session,
   create a separate `dental_portal_app` login with a unique generated password,
   grant it membership in `dental_portal_backend`, set its search path to
   `dental_portal, public`, and limit it to 20 connections. Never use the
   `postgres` owner account as the application runtime.
3. Create an application from this repository using its `Dockerfile`. Set the
   domain to `https://dental.exodiagamedev.com`, expose container port `3000`,
   and leave public port mappings empty.
4. Add the runtime variables from `.env.example` in Coolify. Set
   `NODE_ENV=production`, `PORT=3000`, the HTTPS `PUBLIC_ORIGIN`, and
   `DATABASE_URL` using the least-privilege `dental_portal_app` Supavisor
   session-mode connection on port `5432`. URL-encode special characters in
   the database password. The server verifies the Supabase certificate and
   hostname with the bundled public CA; never disable certificate verification.
5. Do not add a Supabase publishable key, service-role key, or Supabase URL to
   the browser. This application does not use the Supabase browser SDK or Data
   API: React calls only same-origin Fastify routes, and Fastify applies the
   custom OTP, opaque-session, and patient-scoping rules.
6. Set `VITE_CLINIC_PHONE_TEL` and `VITE_CLINIC_PHONE_DISPLAY` as Docker build
   variables using the clinic's real public number; the application shows no
   clickable phone link when these are omitted.
7. Generate independent production peppers with `openssl rand -hex 32`. Store
   them as Coolify secrets; do not reuse development values.
8. Configure the clinic-approved HTTPS SMS relay with `SMS_PROVIDER=http`,
   `SMS_API_URL`, `SMS_API_TOKEN`, and `SMS_SENDER`. The relay receives
   `{ "to", "from", "message" }` with a bearer token. Production intentionally
   refuses to start with `SMS_PROVIDER=development`, missing credentials,
   placeholder peppers, or an HTTP public origin.
9. Use `/api/health` as the health-check path. The application listens on
   `0.0.0.0:3000`; deploy only after `npm run migrate:supabase` succeeds.
10. Deploy and verify direct Coolify routing before enabling Cloudflare proxying.
11. Verify Supabase backup coverage and complete a documented test restore.

The previous Nginx runtime is obsolete: Fastify serves both `/api/*` and the
React single-page application from the same origin.

## Release gates

Do not enable real patient data until all of these are recorded and verified:

- The clinic has selected an SMS provider and verified every pilot patient's
  mobile number.
- Only approved patient-safe fields and published summaries are exposed.
- Cross-patient authorization, OTP, session, logout, expiry, deep-link, and
  no-store tests pass.
- The source of schedules and records, publishing owner, lost-phone recovery,
  retention rules, and adult-only or guardian policy are documented.
- Supabase Data API roles cannot access portal tables, row-level security is
  enabled as defense in depth, and the application uses only the
  least-privilege runtime role over verified TLS.
- Migration credentials and runtime secrets are absent from Git, Coolify logs,
  and browser bundles, and encrypted backup restoration has been demonstrated.
- The clinic's Data Protection Officer has approved the privacy assessment,
  patient notice, access rules, recovery process, and pilot.

The complete engineering and privacy checklist is in
[`docs/PATIENT_PORTAL_AI_IMPLEMENTATION_PLAN.md`](docs/PATIENT_PORTAL_AI_IMPLEMENTATION_PLAN.md).
