# SmileCare Dental Patient Portal

A React, Vite, Tailwind CSS, Fastify, and PostgreSQL patient portal. Patients
use their clinic-issued patient ID and full name, then verify with a one-time
code. The first release is read-only.

> Use fictional records only until every release gate below is complete. A
> name and patient ID alone must never grant access to patient information.

## Local development

Requirements:

- Node.js 22
- PostgreSQL

Create a local database and environment file:

```bash
createdb dental_portal
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Put the two generated values in `.env` as `SESSION_PEPPER` and `OTP_PEPPER`,
then update `DATABASE_URL` if your local PostgreSQL credentials differ.

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

## Coolify deployment

1. Create a PostgreSQL resource in Coolify. Keep it on the private network and
   do not configure a public port mapping.
2. Create an application from this repository using its `Dockerfile`.
3. Set the application domain to `https://dental.exodiagamedev.com`, expose
   container port `3000`, and leave public port mappings empty.
4. Add the variables from `.env.example` in Coolify. Set `NODE_ENV=production`,
   `PORT=3000`, the HTTPS `PUBLIC_ORIGIN`, and the private PostgreSQL
   `DATABASE_URL`. Set `VITE_CLINIC_PHONE_TEL` and
   `VITE_CLINIC_PHONE_DISPLAY` as Docker build variables using the clinic's
   real public number; the application shows no clickable phone link when
   these are omitted.
5. Generate independent production peppers with `openssl rand -hex 32`. Store
   them as Coolify secrets; do not reuse development values.
6. Configure the clinic-approved HTTPS SMS relay with `SMS_PROVIDER=http`,
   `SMS_API_URL`, `SMS_API_TOKEN`, and `SMS_SENDER`. The relay receives
   `{ "to", "from", "message" }` with a bearer token. Production intentionally
   refuses to start with `SMS_PROVIDER=development`, missing credentials,
   placeholder peppers, or an HTTP public origin.
7. Use `/api/health` as the health-check path. The image runs idempotent
   migrations before accepting traffic and listens on `0.0.0.0:3000`.
8. Deploy and verify direct Coolify routing before enabling Cloudflare proxying.
9. Enable encrypted off-server PostgreSQL backups and complete a test restore.

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
- PostgreSQL is private, secrets are absent from Git and logs, and encrypted
  backup restoration has been demonstrated.
- The clinic's Data Protection Officer has approved the privacy assessment,
  patient notice, access rules, recovery process, and pilot.

The complete engineering and privacy checklist is in
[`docs/PATIENT_PORTAL_AI_IMPLEMENTATION_PLAN.md`](docs/PATIENT_PORTAL_AI_IMPLEMENTATION_PLAN.md).
