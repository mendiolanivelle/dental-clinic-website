# Patient Portal Direct-Login Implementation Plan

Status: final implementation contract

Audience: coding agents and maintainers

Application: SmileCare Dental Patient Portal

## 1. Objective

Provide a simple, read-only patient portal where a patient enters:

1. the full name stored by the clinic; and
2. the clinic-issued patient ID.

If both values match an enabled patient, open an authenticated portal session.
There is no self-registration, password, SMS, or one-time-code flow.

Patients can view:

- their profile summary;
- upcoming and past dental appointments;
- published clinical record summaries; and
- their active published treatment plan.

## 2. Security boundary

The full name is not secret. In this design, the patient ID is the private
credential.

Production patient IDs must therefore be:

- generated from a cryptographically secure random source;
- long enough to resist online and offline guessing;
- non-sequential and unrelated to chart numbers, birthdays, phone numbers, or
  other patient information;
- disclosed privately to the patient; and
- replaceable immediately if lost or exposed.

Do not use the fictional `PT-DEMO01` seed format in production.

Direct name-and-ID login is weaker than multi-factor authentication. This is an
accepted product constraint, not permission to weaken session handling,
rate-limiting, authorization, audit, transport security, or database isolation.

## 3. Non-negotiable requirements

An implementation is incomplete unless all of these remain true:

- The browser calls only same-origin Fastify endpoints.
- Supabase Auth, the Supabase browser SDK, and the Supabase Data API are not
  used for portal authentication or patient data.
- Login has strict per-client rate limiting.
- Unknown, disabled, and mismatched accounts receive the same generic error.
- Request bodies, cookies, names, patient IDs, session tokens, and clinical
  content are not written to application logs.
- A successful login creates a new opaque random session token.
- Only a SHA-256 digest of the session token is stored in PostgreSQL.
- The raw token is sent only in a `Secure`, `HttpOnly`, `SameSite=Lax`,
  host-only cookie.
- Sessions enforce both idle and absolute expiry.
- Every protected query derives the patient ID from the authenticated session,
  never from a browser-supplied patient selector.
- Only published patient-safe clinical summaries are returned.
- Login and protected-record access create audit events without storing raw
  credentials or clinical content in the audit metadata.
- The Supabase runtime role has least privilege and uses verified TLS.
- Supabase API roles cannot access the private portal schema.

## 4. Architecture

```text
Browser
  React + React Router + Tailwind CSS
        |
        | same-origin HTTPS /api/*
        v
Fastify
  validation
  origin checks
  rate limiting
  opaque session cookie
  patient authorization
  audit events
        |
        | verified PostgreSQL TLS
        v
Supabase PostgreSQL
  private dental_portal schema
  least-privilege dental_portal_app login
  RLS as defense in depth
```

Fastify serves the built React application and the API from container port
`3000`. A separate Nginx runtime is not required.

## 5. Frontend contract

### 5.1 Public route

`/login`

The form contains exactly:

- `fullName`
- `patientNumber`

On submit:

1. trim the fields;
2. uppercase the patient ID for display and submission;
3. call `POST /api/auth/login`;
4. pass the returned patient summary to the application authentication state;
5. redirect to `/portal`; and
6. show a generic help message for any rejected credentials.

Do not add a registration page, password field, verification page, resend
control, or browser-side session token storage.

### 5.2 Protected routes

```text
/portal
/portal/appointments
/portal/records
/portal/treatment-plan
/portal/profile
```

The sidebar remains the primary navigation so more portal sections can be added
without redesigning the layout.

On application load, call `GET /api/me`:

- `200`: restore the authenticated patient state;
- `401`: show `/login`; and
- network or `5xx`: show the retryable unavailable state.

Any protected API `401` clears the frontend patient state and returns the user
to `/login`.

## 6. API contract

### 6.1 Login

```http
POST /api/auth/login
Content-Type: application/json
Origin: https://dental.exodiagamedev.com
```

```json
{
  "fullName": "Nivelle Delos Santos Mendiola",
  "patientNumber": "PT-RANDOM-PATIENT-ID"
}
```

Validation:

- reject extra properties;
- `fullName`: string, 1 to 160 characters;
- `patientNumber`: string, 4 to 40 characters;
- normalize Unicode, trim, and collapse name whitespace;
- normalize the patient ID to uppercase; and
- permit only uppercase letters, digits, and hyphens in the normalized ID.

Success:

```json
{
  "patient": {
    "displayName": "Nivelle Delos Santos Mendiola",
    "patientNumber": "PT-RANDOM-PATIENT-ID"
  }
}
```

Invalid credentials:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The name or patient ID is not recognized."
  }
}
```

The same `401` response is used for unknown, mismatched, and disabled patients.
A rate-limited client receives a generic `429` response that does not reveal
whether an account exists.

### 6.2 Session and patient endpoints

```text
POST /api/auth/logout
GET  /api/me
GET  /api/me/dashboard
GET  /api/me/appointments?scope=upcoming|past
GET  /api/me/appointments/:id
GET  /api/me/records
GET  /api/me/records/:id
GET  /api/me/treatment-plan
GET  /api/health
```

All state-changing API requests must have the exact configured `Origin`.
Authentication and patient responses must include `Cache-Control: no-store`.
Unknown API routes return a JSON `404`; valid React deep links return
`dist/index.html`.

## 7. Login and session behavior

### 7.1 Rate limiting

Apply the rate limiter directly to `POST /api/auth/login`.

Configuration:

```text
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
```

Key attempts by the trusted client IP after the configured reverse-proxy hop.
The limit must run before patient lookup and must apply equally to successful
and failed submissions. Do not use a patient name or ID as a response-visible
rate-limit key.

The in-process limiter assumes one Fastify replica. Before horizontal scaling,
move the limit to a shared store or an approved edge control. Verify in
production that `request.ip` resolves to the patient-facing client address and
cannot be chosen through a spoofed forwarding header.

### 7.2 Account match

Match both:

- normalized full name; and
- normalized patient ID.

Require `portal_enabled = true`. Do not require a phone number or phone
verification state.

Perform account lookup and session creation through the server-side store. No
patient lookup result is sent to the browser unless session creation succeeds.

### 7.3 Opaque session

For each successful login:

1. generate 32 random bytes using Node's cryptographic random source;
2. encode the bytes with base64url for the browser token;
3. store only `SHA-256(token)` in `portal_sessions`;
4. set the cookie named `__Host-portal_session`;
5. set `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`;
6. omit `Domain` so the cookie stays host-only; and
7. create a `portal.login_succeeded` audit event in the same database
   transaction as the session.

Never place the token in JSON, a URL, `localStorage`, or `sessionStorage`.

### 7.4 Session checks

Every protected request must verify:

- the token digest exists;
- the session is not revoked;
- absolute expiry is in the future;
- last activity is within `SESSION_IDLE_MINUTES`; and
- the patient still has portal access enabled.

Update `last_seen_at` after a valid check. Logout marks the session revoked and
clears the cookie. Invalid or expired sessions also clear the cookie.

## 8. Authorization and audit

All appointment, record, and treatment-plan queries include the authenticated
`patient_id`.

Never accept `patientId` in a request body, path, or query string as an
authorization selector. A valid UUID belonging to another patient must return
the same `404` as an unknown UUID.

Clinical records and treatment plans require `published_at IS NOT NULL`.
Treatment-plan responses return only the active published plan.

Audit events may contain:

- actor type and authenticated patient UUID;
- action name;
- object type and UUID;
- timestamp;
- request ID;
- a keyed digest of the IP address; and
- a truncated user-agent value.

Audit events must not contain a full name, patient ID, session token, cookie,
appointment instructions, or clinical summary.

## 9. Database requirements

Portal tables live in the private `dental_portal` schema:

- `patients`
- `dentists`
- `appointment_types`
- `appointments`
- `treatment_plans`
- `clinical_records`
- `portal_sessions`
- `audit_events`

Applied migrations are immutable. Add a new ordered migration for schema
changes; never edit a migration already recorded in
`dental_portal.schema_migrations`.

The non-login `dental_portal_backend` role receives only the operations used by
the server. The production login `dental_portal_app` inherits that role and
uses the search path `dental_portal, public`.

The `anon`, `authenticated`, and `service_role` API roles receive no schema or
table access to the portal. RLS stays enabled and forced as defense in depth,
but application-level patient scoping remains mandatory.

## 10. Environment contract

Runtime variables:

```dotenv
NODE_ENV=production
PORT=3000
PUBLIC_ORIGIN=https://dental.exodiagamedev.com
DATABASE_URL=postgresql://dental_portal_app.<project-ref>:<url-encoded-password>@<session-pooler-host>:5432/postgres
SESSION_PEPPER=<at-least-32-random-bytes>
SESSION_IDLE_MINUTES=30
SESSION_ABSOLUTE_HOURS=8
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
```

Optional public build variables:

```dotenv
VITE_CLINIC_PHONE_TEL=
VITE_CLINIC_PHONE_DISPLAY=
```

One-time migration-shell variables:

```dotenv
SUPABASE_PROJECT_REF=<project-ref>
SUPABASE_ACCESS_TOKEN=<temporary-management-token>
```

The migration variables must never be stored in Coolify or a browser bundle.
No Supabase project URL, publishable key, service-role key, or management token
is required by the runtime or frontend.

Production configuration must reject:

- a non-Supabase database host;
- transaction-pooler port `6543`;
- an owner or `postgres` database role;
- a non-HTTPS public origin;
- missing or placeholder session pepper values; and
- invalid session or rate-limit durations.

## 11. Supabase migration

Use the management API migration command only from a trusted machine:

```bash
SUPABASE_PROJECT_REF=<project-ref> \
SUPABASE_ACCESS_TOKEN=<temporary-access-token> \
npm run migrate:supabase
```

Requirements:

- apply migrations in filename order;
- store and verify a SHA-256 checksum for each migration;
- refuse changed migrations;
- refuse unsafe public-table name collisions;
- keep management tokens out of SQL and logs; and
- make a second run a no-op.

Use the Supavisor session-mode endpoint on port `5432` for Coolify. The runtime
must verify the Supabase CA and hostname. Never set
`rejectUnauthorized: false`.

## 12. Coolify deployment

1. Build the repository `Dockerfile`.
2. Expose container port `3000`; do not add a host port mapping.
3. Set the production domain and exact `PUBLIC_ORIGIN` to
   `https://dental.exodiagamedev.com`.
4. Add only the runtime and optional public build variables from section 10.
5. Set the health check to `/api/health`.
6. Run migrations before deploying the application version.
7. Verify the direct Coolify route before enabling Cloudflare proxying.
8. After enabling Cloudflare, verify `/`, `/login`, a `/portal/*` deep link,
   `/favicon.svg`, and `/api/health`.
9. Confirm no secret appears in image layers, build logs, runtime logs, or
   browser assets.

## 13. Required tests

### Authentication

- Unicode, whitespace, and case normalization work as specified.
- Missing and extra login fields return `400`.
- Exact valid details create one session and return the patient summary.
- Unknown, mismatched, and disabled accounts return identical `401` bodies.
- Rate limits apply to repeated valid and invalid attempts.
- The production proxy supplies a trustworthy client IP for rate limiting.
- The raw session token is not stored.
- Cookie flags include `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Logout revokes the session and clears the cookie.
- Idle and absolute expiry reject the session.
- A disabled patient cannot reuse an existing session.
- Login success creates the expected audit event.

### Authorization and privacy

- Unauthenticated patient endpoints return `401`.
- Another patient's appointment and record UUIDs return `404`.
- Unpublished records and plans are never returned.
- Browser-supplied patient selectors are rejected.
- Authentication and patient endpoints include `Cache-Control: no-store`.
- State-changing requests without the configured origin return `403`.
- Logs contain no request body, cookie, token, full name, patient ID, or
  clinical content.

### Supabase and deployment

- Migrations are ordered, checksummed, idempotent, and immutable.
- Portal tables are inaccessible to Supabase API roles.
- The runtime role has only required grants.
- RLS is enabled and forced on portal tables.
- TLS certificate and hostname verification succeed.
- Production rejects owner roles and port `6543`.
- `npm run verify` passes.
- `/api/health` fails closed when PostgreSQL is unavailable.
- React deep links load while unknown `/api/*` paths remain JSON `404`.

## 14. Implementation order for an AI agent

1. Inspect the existing working tree and preserve unrelated user changes.
2. Remove the obsolete verification route, page, API calls, configuration, and
   delivery module.
3. Implement the single direct-login endpoint and store transaction.
4. Preserve opaque-session, origin, audit, and patient-scoping code.
5. Add an ordered migration only if the stored schema must change.
6. Update frontend login behavior and remove verification navigation.
7. Update tests before changing deployment configuration.
8. Run `npm run verify`.
9. Apply Supabase migrations and verify them with a second no-op run.
10. Confirm Coolify uses only the runtime variables in section 10.
11. Deploy and test the production domain.
12. Commit and push the verified result to `main`.

## 15. Definition of done

The work is complete only when:

- a valid full name and patient ID open the portal directly;
- no registration, password, SMS, or one-time-code screen or dependency
  remains;
- invalid credentials cannot create a session or reveal account existence;
- strict rate limiting, opaque sessions, expiry, logout, audit, patient
  scoping, and published-record filtering pass automated tests;
- Supabase remains private and least privilege over verified TLS;
- Coolify starts successfully without delivery-provider variables;
- production health and deep-link checks pass; and
- the verified commit is pushed to `main`.
