# SmileCare Dental Portal

A patient portal built with React, Vite, Tailwind CSS, Fastify, and
Supabase-hosted PostgreSQL. Patients sign in with the full name recorded by the
clinic and their clinic-issued patient ID. They can browse the clinic service
catalog and choose an open doctor time from the hourly appointment calendar. There
is no patient registration, password, SMS, or one-time-code step.

Clinic reception staff use the same login page with a separate **Clinic staff**
tab. Supabase Auth verifies clinic-provisioned staff accounts, while the backend
keeps staff sessions and permissions separate from patient access.

> Direct login is intentionally simple. In production, patient IDs must be
> long, random, non-sequential, kept private, and replaced if disclosed. A
> predictable chart number is not suitable as a portal credential.

## Local development

Requirements:

- Node.js 22
- PostgreSQL

Create the local role and database, then copy the example environment:

```bash
createuser --createdb --createrole --pwprompt dental_portal
createdb --owner=dental_portal dental_portal
cp .env.example .env
openssl rand -hex 32
```

Put the local database password in `DATABASE_URL` and the generated value in
`SESSION_PEPPER`. Then install, migrate, seed fictional data, and start:

```bash
npm ci
npm run migrate
npm run seed:demo
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) and use:

```text
Full name: Patricia Portal Demo
Patient ID: PT-DEMO01
```

The demo ID is deliberately obvious and must never be copied into production.
Never place real patient data, credentials, database dumps, or screenshots in
Git or application logs.

## Create a reception account

Reception accounts are invite-only. In the Supabase Dashboard, open
**Authentication → Users**, create a confirmed email/password user, and copy its
UUID. Then run this once in the Supabase SQL Editor with the real values:

```sql
insert into dental_portal.staff_profiles
  (auth_user_id, email, display_name, role, active)
values
  ('<auth-user-uuid>', '<work-email>', '<staff-name>', 'receptionist', true);
```

Do not share reception accounts. Disable `active` when an employee leaves.

From the reception portal, search the patient’s name first. If no match exists,
choose **Create patient account**, enter the full name and optional phone number,
and give the patient the next five-digit portal ID, such as `00001`. Because the
ID is also the patient login credential, keep it private and rely on the portal
rate limits and audit trail to reduce guessing attempts.

## Authentication and privacy

`POST /api/auth/login` accepts only `fullName` and `patientNumber`. The server
normalizes both fields, strictly limits failed credentials, and returns the
same generic error for an unknown, disabled, or mismatched account. Successful
sign-ins and logout do not consume the failed-attempt budget.

Successful login creates a cryptographically random opaque session token. Only
its SHA-256 digest is stored in PostgreSQL. The browser receives the token in a
`Secure`, `HttpOnly`, `SameSite=Lax`, host-only cookie. Sessions have idle and
absolute expiry, can be revoked on logout, and are checked again on every
protected request.

Fastify is the only browser-facing API. It enforces the configured origin,
patient ownership, published-record rules, response `no-store` headers, request
body redaction, and audit events for login and protected record access.
Supabase's browser SDK and Data API are not used. The backend calls Supabase Auth
only to verify staff email/password credentials.

Appointment requests are intentionally not automatic confirmations. The
calendar uses active dentists and hides conflicts with scheduled, confirmed,
or already-requested visits. The initial clinic schedule is Monday–Saturday,
9:00 AM–5:00 PM Manila time, in one-hour slots.

## Verification

Run before every deployment:

```bash
npm run verify
```

The deployed container must also pass:

```bash
curl --fail http://127.0.0.1:3000/api/health
```

## Supabase and Coolify deployment

1. In Supabase, use the Supavisor **session mode** connection on port `5432`.
   Do not use transaction mode on port `6543` for the persistent Fastify
   container.
2. Apply database migrations from a trusted administrator machine:

   ```bash
   SUPABASE_PROJECT_REF=<project-ref> \
   SUPABASE_ACCESS_TOKEN=<temporary-access-token> \
   npm run migrate:supabase
   ```

   Unset both values afterward. Never store the management access token in
   Coolify, the React build, Git, or logs.
3. Run the application with the dedicated `dental_portal_app` login role,
   membership in `dental_portal_backend`, search path
   `dental_portal, public`, and a unique generated password. Never use the
   `postgres` owner role at runtime.
4. In Coolify, build from the repository `Dockerfile`, expose container port
   `3000`, set the domain to `https://dental.exodiagamedev.com`, and configure:

   ```text
   NODE_ENV=production
   PORT=3000
   PUBLIC_ORIGIN=https://dental.exodiagamedev.com
   DATABASE_URL=<least-privilege Supavisor session URL on port 5432>
   SESSION_PEPPER=<at least 32 random bytes>
   SESSION_IDLE_MINUTES=30
   SESSION_ABSOLUTE_HOURS=8
   LOGIN_MAX_ATTEMPTS=5
   LOGIN_WINDOW_MINUTES=15
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   ```

   URL-encode special characters in the database password. The server verifies
   the Supabase certificate and hostname with the bundled CA; never disable
   certificate verification.
5. Store the Supabase URL and publishable key in Coolify for staff login. Never
   store a service-role key or management token in the frontend or runtime.
6. Optionally set `VITE_CLINIC_PHONE_TEL` and
   `VITE_CLINIC_PHONE_DISPLAY` as Docker build variables for the public clinic
   contact link.
7. Set `/api/health` as the Coolify health-check path. Apply migrations before
   deploying, verify direct Coolify routing, then enable the Cloudflare proxy.
8. Confirm Supabase backup coverage and complete a documented restore test.

Fastify serves both `/api/*` and the React single-page application from the
same origin; a separate Nginx container is not required.

## Release gates

Do not enable real patient records until:

- every production patient ID is randomly generated, non-sequential, and
  distributed privately;
- rate-limit, generic-error, session, logout, expiry, origin, deep-link,
  no-store, and cross-patient authorization tests pass;
- service catalog and appointment-request migrations are applied before the
  patient booking flow is enabled;
- only approved patient-safe fields and published summaries are exposed;
- Supabase API roles cannot access portal tables, RLS is enabled as defense in
  depth, and the runtime role is least privilege over verified TLS;
- application logs and browser assets contain no credentials or patient data;
- retention, credential replacement, guardian access, incident response,
  backup restoration, and clinic support procedures are documented; and
- the clinic's Data Protection Officer has approved the privacy assessment,
  patient notice, access model, and pilot.

The AI-executable design and acceptance criteria are in
[`docs/PATIENT_PORTAL_AI_IMPLEMENTATION_PLAN.md`](docs/PATIENT_PORTAL_AI_IMPLEMENTATION_PLAN.md).
