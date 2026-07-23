# AI Implementation Specification: Dental Patient Portal

## 1. Instruction to the Implementing AI

You are extending an existing React, Vite, and Tailwind CSS dental website into
a secure, passwordless patient portal.

Implement this specification in order. Do not replace the current visual design.
Do not expose real patient data until every release gate in this document passes.
Do not weaken the authentication flow to full name and patient ID alone.

Before editing:

1. Read the entire repository and this specification.
2. Check `git status` and preserve unrelated user changes.
3. Confirm the current application builds.
4. State any assumptions that differ from this document.
5. Work phase by phase, running the listed checks after each phase.

When a requirement is unclear, choose the safest minimal behavior and document
the assumption. Stop and ask the user only when a missing decision affects
security, real patient data, an external provider, or destructive changes.

## 2. Product Objective

Build a responsive portal where a clinic-created patient can:

- Log in without registering or creating a password.
- Enter their full name and patient ID as lookup information.
- Prove possession of the mobile number verified by clinic staff using a
  short-lived one-time code.
- View only their own upcoming appointments.
- View completed treatment history published for the patient.
- View an active treatment plan and recommended next visit.
- Contact the clinic or request assistance with rescheduling.
- Log out securely.

The first release is read-only. Patients must not directly create, edit, cancel,
or reschedule appointments in the database.

## 3. Non-Negotiable Decisions

These decisions are fixed unless the product owner explicitly changes them:

1. Full name and patient ID are identifiers, not authentication secrets.
2. Real records require a second verification step using a one-time SMS code.
3. There is no public patient registration page.
4. Clinic staff pre-provisions patients and verifies their mobile numbers.
5. Patient-facing IDs are random and non-sequential.
6. The portal is served from the existing origin:
   `https://dental.exodiagamedev.com`.
7. The React application and API are served by one Node process on port `3000`.
8. PostgreSQL is the database and is accessible only on Coolify's private
   network.
9. Authentication uses an opaque server-side session and an HttpOnly cookie.
10. Authentication tokens, OTPs, and clinical data must never be stored in
    `localStorage` or `sessionStorage`.
11. The server derives the current patient from the session. The client never
    selects a patient by sending a `patient_id`.
12. Only records with a publication timestamp may be returned to a patient.
13. Internal clinical notes are not part of the patient portal MVP.
14. The MVP does not include billing, chat, X-rays, document uploads, online
    payments, or direct booking.
15. Use JavaScript, matching the current repository. Do not migrate the project
    to TypeScript as part of this feature.

## 4. Current Repository State

The current project is a static prototype:

- React, Vite, Tailwind CSS, and Lucide React are installed.
- `src/App.jsx` contains hard-coded patient and appointment data.
- Sidebar buttons change only local visual state.
- There is no router, API, authentication, database, or test suite.
- The current Docker image serves static files with Nginx on port `3000`.

The implementation must preserve the existing responsive sidebar style while
replacing mock patient data with authenticated API data.

## 5. Scope

### 5.1 Patient routes

- `/login`
- `/verify`
- `/portal`
- `/portal/appointments`
- `/portal/records`
- `/portal/treatment-plan`
- `/portal/profile`

Unauthenticated access to any `/portal/*` route redirects to `/login`.
Authenticated access to `/login` or `/verify` redirects to `/portal`.

### 5.2 Patient features

- Passwordless login
- OTP verification
- Secure logout
- Session-expired handling
- Dashboard summary
- Upcoming and past appointments
- Published treatment history
- Current treatment plan
- Recommended or overdue care
- Clinic contact and reschedule-assistance action
- Loading, empty, error, and offline states
- Mobile sidebar drawer and desktop sidebar

### 5.3 Explicitly deferred

- Patient self-registration
- Password login
- Patient editing of clinical data
- Direct calendar booking or cancellation
- Payments and billing
- Messaging
- Attachments, X-rays, and prescriptions
- Push notifications
- Native mobile application
- Multi-clinic support
- Microservices, Redis, queues, GraphQL, Redux, and an ORM
- Passkeys, until the SMS OTP MVP is stable
- Guardian access, unless minors are approved for the production pilot

If the clinic serves minors, adult-only access is a release gate. Do not give
minors production portal access until verified guardian relationships and
guardian accounts are implemented.

## 6. Required Architecture

```text
Cloudflare
  -> Coolify proxy
     -> Node application on port 3000
        -> serves built React files
        -> exposes same-origin /api routes
        -> sends OTP through an approved SMS provider
        -> connects to private PostgreSQL
        -> records security audit events
```

Use a single application container and a separate private PostgreSQL resource.
Do not create a separate public API domain. Same-origin API calls avoid
unnecessary CORS and cookie complexity.

### 6.1 Required dependencies

Use the smallest stable set:

- Existing React, React DOM, Vite, Tailwind CSS, and Lucide React
- `react-router-dom`
- `fastify`
- `@fastify/cookie`
- `@fastify/helmet`
- `@fastify/rate-limit`
- `@fastify/static`
- `pg`

Use Node's built-in `crypto`, `fetch`, and `node:test` where possible. Do not
add an ORM, Axios, Redux, React Query, a validation framework, or a logging
platform for the MVP. Use Fastify JSON schemas for request validation and
Fastify's `inject` for API tests.

### 6.2 Suggested file structure

Keep the structure understandable and avoid speculative layers:

```text
src/
  App.jsx
  components/
    PortalLayout.jsx
  pages/
    LoginPage.jsx
    VerifyPage.jsx
    DashboardPage.jsx
    AppointmentsPage.jsx
    RecordsPage.jsx
    TreatmentPlanPage.jsx
    ProfilePage.jsx
  api.js
  index.css
  main.jsx

server/
  app.js
  index.js
  config.js
  db.js
  auth.js
  migrate.js
  sms.js
  routes/
    auth.js
    patient.js
    health.js

migrations/
  001_patient_portal.sql

test/
  auth.test.js
  authorization.test.js

scripts/
  seed-demo.js
```

Do not introduce repositories, service classes, factories, or interfaces unless
there are at least two real implementations.

## 7. Patient Login Flow

### 7.1 Clinic provisioning

Before a patient can log in, clinic staff must:

1. Verify the patient's identity in person.
2. Create or import the patient record.
3. Verify the patient's mobile number.
4. Assign a random patient number such as `PT-7K4N9Q`.
5. Enable portal access.

Do not use sequential database IDs as patient numbers.

### 7.2 Start login

The patient submits:

```json
{
  "fullName": "Patricia Portal Demo",
  "patientNumber": "PT-7K4N9Q"
}
```

Normalize names using Unicode NFKC, lowercase, trimming, and collapsed internal
whitespace. Preserve the display name separately. Normalize patient numbers to
uppercase and trim whitespace.

Whether the record matches or not, return the same status, response shape, and
message:

```http
202 Accepted
```

```json
{
  "challengeId": "random-public-challenge-id",
  "message": "If the details match our records, a verification code was sent."
}
```

Do not reveal:

- Whether the patient exists
- Which field was incorrect
- A phone number or phone-number suffix before authentication
- Whether the portal is enabled

For unknown users, create or emulate a dummy challenge so the response timing
and shape remain comparable. Do not send an SMS for a dummy challenge.

### 7.3 OTP rules

- Generate with a cryptographically secure random source.
- Use six decimal digits.
- Expire after five minutes.
- Allow no more than five verification attempts.
- Make the code single-use.
- A resend must invalidate the previous code.
- A resend must not bypass account or IP rate limits.
- Limit starts and resends per IP, patient lookup, and time window.
- Store only an HMAC or secure digest of the code, never the plaintext code.
- Never log the code.
- The SMS contains only the code and expiry. It must not include treatment,
  appointment, or diagnostic information.
- Production must fail closed if a real SMS provider is not configured.
- A fake delivery provider may exist only in test/development and must refuse to
  start when `NODE_ENV=production`.

The SMS provider is a required external decision. Isolate it in one small
`sendOtp(phone, code)` module and implement only the selected provider.

### 7.4 Verify login

The patient submits:

```json
{
  "challengeId": "challenge-id",
  "code": "123456"
}
```

On success:

1. Atomically mark the challenge used.
2. Create at least 32 random bytes for an opaque session token.
3. Store only a SHA-256 digest of the session token.
4. Send the original token in this cookie:

```text
__Host-portal_session=<token>; Secure; HttpOnly; SameSite=Lax; Path=/
```

5. Apply a 30-minute inactivity timeout.
6. Apply an eight-hour absolute timeout.
7. Record a successful-login audit event.

On failure, return one generic error. Increment attempts atomically. Never
distinguish incorrect, expired, used, disabled, or dummy challenges to the
patient.

### 7.5 Logout and recovery

- Logout revokes the current server-side session and clears the cookie.
- Lost-phone recovery is clinic-assisted after identity verification.
- Do not use date of birth, address, or security questions as the only recovery
  proof.
- Do not build public contact-number changes in the MVP.

## 8. Database Specification

Use PostgreSQL UUID primary keys generated with `gen_random_uuid()`. Store all
appointment timestamps as `timestamptz` in UTC and convert to Asia/Manila in the
UI.

### 8.1 `patients`

- `id uuid primary key`
- `patient_number text unique not null`
- `display_name text not null`
- `normalized_name text not null`
- `phone_e164 text not null`
- `phone_verified_at timestamptz not null`
- `portal_enabled boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 8.2 `dentists`

- `id uuid primary key`
- `display_name text not null`
- `specialty text`
- `active boolean not null default true`

### 8.3 `appointment_types`

- `id uuid primary key`
- `name text unique not null`
- `default_duration_minutes integer not null`
- `patient_description text`

Seed examples: Cleaning, Brace Adjustment, Routine Checkup, Consultation,
Extraction, Filling.

### 8.4 `appointments`

- `id uuid primary key`
- `patient_id uuid not null references patients(id)`
- `dentist_id uuid not null references dentists(id)`
- `appointment_type_id uuid not null references appointment_types(id)`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `status text not null`
- `patient_instructions text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Allowed statuses: `scheduled`, `confirmed`, `completed`, `cancelled`,
`no_show`.

### 8.5 `treatment_plans`

- `id uuid primary key`
- `patient_id uuid not null references patients(id)`
- `title text not null`
- `patient_summary text not null`
- `status text not null`
- `started_on date`
- `recommended_interval_days integer`
- `next_recommended_on date`
- `published_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Only rows with `published_at is not null` are visible to patients.

### 8.6 `clinical_records`

- `id uuid primary key`
- `patient_id uuid not null references patients(id)`
- `dentist_id uuid not null references dentists(id)`
- `appointment_id uuid references appointments(id)`
- `procedure_name text not null`
- `treated_on date not null`
- `patient_summary text not null`
- `published_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Do not add internal dentist notes to this portal table in the MVP.

### 8.7 `login_challenges`

- `id uuid primary key`
- `patient_id uuid references patients(id)`
- `code_digest text`
- `expires_at timestamptz not null`
- `attempt_count integer not null default 0`
- `max_attempts integer not null default 5`
- `used_at timestamptz`
- `created_at timestamptz not null default now()`

`patient_id` and `code_digest` may be null for dummy challenges.

### 8.8 `portal_sessions`

- `id uuid primary key`
- `patient_id uuid not null references patients(id)`
- `token_digest text unique not null`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz not null default now()`
- `absolute_expires_at timestamptz not null`
- `revoked_at timestamptz`

### 8.9 `audit_events`

- `id uuid primary key`
- `actor_type text not null`
- `actor_id uuid`
- `action text not null`
- `object_type text`
- `object_id uuid`
- `occurred_at timestamptz not null default now()`
- `request_id text`
- `ip_digest text`
- `user_agent text`

Do not store names, phone numbers, OTPs, clinical summaries, or full request
bodies in audit events.

Add indexes for patient lookups, upcoming appointments, published records,
challenge expiry, active session lookup, and audit time.

## 9. API Contract

All API responses use JSON except `204 No Content`.

### 9.1 Public authentication endpoints

```text
POST /api/auth/start
POST /api/auth/verify
POST /api/auth/resend
POST /api/auth/logout
GET  /api/health
```

### 9.2 Authenticated patient endpoints

```text
GET /api/me
GET /api/me/dashboard
GET /api/me/appointments?scope=upcoming|past
GET /api/me/appointments/:appointmentId
GET /api/me/records
GET /api/me/records/:recordId
GET /api/me/treatment-plan
```

Do not create endpoints shaped like:

```text
GET /api/patients/:patientId/records
GET /api/patients/:patientId/appointments
```

Every patient query must include the authenticated session patient:

```sql
... where id = $requested_object_id and patient_id = $session_patient_id
```

Appointment and record detail endpoints must return `404` for both nonexistent
and unauthorized objects.

### 9.3 Response rules

- Validate every request body, parameter, and query string.
- Return stable error codes suitable for the UI.
- Do not return database errors or stack traces.
- Set `Cache-Control: no-store` on authenticated and authentication responses.
- Verify the request `Origin` on state-changing requests.
- Use security headers through Helmet.
- Configure the application to trust only the Coolify proxy.
- Redact cookies, authorization values, names, patient numbers, phone numbers,
  OTP fields, and request bodies from logs.

## 10. Frontend Requirements

### 10.1 General

- Preserve the existing colors, typography, cards, and responsive sidebar.
- Replace hard-coded identity and appointment values with API responses.
- Use semantic HTML, visible focus states, labels, and keyboard navigation.
- Support widths from 320px upward.
- Never place clinical data or patient IDs in URL query strings.
- Use native `fetch` through one small `src/api.js` wrapper with
  `credentials: "same-origin"`.
- Do not cache patient API responses beyond component memory.
- Clear patient state immediately on logout or `401`.

### 10.2 Login page

- Full-name field labeled “Full name as recorded by the clinic”
- Patient-ID field labeled “Patient ID”
- Example formatting only; do not display a real person's full name
- Clear explanation: “No password is required. We will verify the mobile number
  registered with the clinic.”
- Generic success and error messages
- Link to call the clinic when the patient ID or mobile number is unavailable

### 10.3 Verification page

- Six individual visual positions or one accessible numeric input
- Paste support
- Five-minute expiry indicator
- Resend button with cooldown
- Never reveal the registered phone number before successful authentication
- Return to login option

### 10.4 Dashboard

- Patient greeting from `/api/me`
- Next confirmed or scheduled appointment
- Current published treatment plan
- Next recommended care date
- Recent published treatment
- Clinic contact

### 10.5 Appointments

- Separate upcoming and past sections
- Display Asia/Manila date and time
- Show appointment type, dentist, status, and patient instructions
- “Request reschedule” opens the clinic phone/contact action only
- Do not mutate appointment data

### 10.6 Records

- Show only published patient summaries
- Display procedure, treatment date, and dentist
- No raw diagnosis codes, internal notes, or attachments in the MVP
- Clear empty state

### 10.7 Treatment plan

- Show only the active published plan
- Display patient-safe summary, start date, expected interval, and next
  recommended date
- Clearly distinguish a recommendation from a booked appointment

## 11. Demo Data and Import Rules

- Use obviously fictional demo patients in development and tests.
- Never commit a CSV, database dump, screenshot, or log containing real patient
  information.
- Provide a repeatable demo seed script.
- The seed script must refuse to run in production unless an explicit,
  separately named override is provided.
- Before production integration, determine whether the source of truth is
  paper, Excel, Google Sheets, or another clinic system.
- Do not build a general staff administration portal in this MVP.
- For a pilot, use a controlled import process or direct clinic-operated data
  entry outside the public portal.

Production rollout is blocked until the clinic defines how appointments and
published records are maintained.

## 12. Environment Variables

Document these in `.env.example` without real values:

```text
NODE_ENV=development
PORT=3000
PUBLIC_ORIGIN=https://dental.exodiagamedev.com
DATABASE_URL=postgres://...
SESSION_PEPPER=replace-with-at-least-32-random-bytes
OTP_PEPPER=replace-with-at-least-32-random-bytes
SMS_PROVIDER=development
SMS_API_URL=
SMS_API_TOKEN=
SMS_SENDER=
SESSION_IDLE_MINUTES=30
SESSION_ABSOLUTE_HOURS=8
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=5
```

Validate required variables at startup. Production must refuse to start with
development placeholders, a development SMS provider, an HTTP public origin,
or missing peppers.

## 13. Coolify Deployment Requirements

1. Build the React application during the Docker build.
2. Use a Node 22 runtime image.
3. Serve the built React files and API from the same Fastify application.
4. Listen on `0.0.0.0:3000`.
5. Expose port `3000`.
6. Add `GET /api/health` and a Docker health check.
7. Create PostgreSQL as a separate Coolify resource.
8. Keep PostgreSQL private; do not add a public port mapping.
9. Configure all secrets in Coolify, not Git.
10. Run idempotent SQL migrations before the application starts accepting
    traffic.
11. Enable encrypted off-server database backups.
12. Test a database restore before production launch.
13. Keep Cloudflare proxying only after direct Coolify routing works.
14. Do not log environment variables or connection strings during deployment.

The Node runtime replaces the current production Nginx runtime. Remove obsolete
Nginx configuration only after the Node server correctly handles SPA fallback
for `/portal/*`.

## 14. Implementation Phases

### Phase 0: Baseline

- Run the existing build.
- Record existing responsive behavior.
- Add this plan to the implementation checklist.
- Add `.env.example`.

Exit criteria:

- Existing build passes.
- No unrelated files changed.

### Phase 1: Routing and static portal screens

- Add React Router.
- Split the current dashboard into the portal layout and pages.
- Add login and verification screens.
- Use fictional in-memory data only during this phase.

Exit criteria:

- All routes render.
- Protected routes redirect correctly using a temporary auth fixture.
- Desktop and mobile sidebar behavior remains correct.
- Production frontend build passes.

### Phase 2: Database and API foundation

- Add Fastify.
- Add configuration validation.
- Add PostgreSQL connection and migration runner.
- Add the initial migration.
- Add health endpoint.
- Serve `dist` with SPA fallback.
- Add fictional demo seed script.

Exit criteria:

- Migration works on an empty database and is idempotent.
- Health endpoint reports application and database readiness.
- React deep links load directly.
- API tests run without a browser.

### Phase 3: Authentication

- Implement login start, OTP delivery boundary, verify, resend, session
  middleware, and logout.
- Add generic responses, atomic attempt limits, expiry, rate limits, cookie
  flags, log redaction, and audit events.
- Implement development/test OTP delivery with a production refusal guard.

Exit criteria:

- Known and unknown login starts have the same status and response shape.
- OTP expires, is single-use, and locks after the configured attempts.
- Resend invalidates the previous OTP.
- Session cookie has Secure, HttpOnly, SameSite, and Path attributes.
- Logout revokes the session.
- Production refuses the development SMS provider.

Stop before real SMS integration if the provider has not been selected.

### Phase 4: Patient data authorization

- Implement `/api/me` and all patient endpoints.
- Scope every query to the session patient.
- Return only published records and treatment plans.
- Write audit events without clinical content.

Exit criteria:

- Patient A cannot list or retrieve Patient B's data.
- Changing an appointment or record identifier does not bypass authorization.
- Unpublished records never appear.
- No endpoint accepts a patient ID to select the active patient.

### Phase 5: Connect the frontend

- Replace fixture data with the real API.
- Implement loading, empty, error, offline, expired-session, and logout states.
- Format dates in Asia/Manila.
- Remove all hard-coded prototype patient data.

Exit criteria:

- A fictional test patient completes the full login flow.
- Dashboard, appointments, records, and treatment plan use database data.
- Logout clears UI state and revokes the session.
- Mobile and desktop layouts pass visual checks.

### Phase 6: Security and deployment

- Add production Docker runtime.
- Configure Coolify variables and private PostgreSQL.
- Configure the approved SMS provider.
- Add security headers, no-store behavior, health check, backup, and restore
  documentation.
- Test a clean deploy and rollback.

Exit criteria:

- Production build and container start successfully.
- Direct Coolify domain routing works on port `3000`.
- Health check passes.
- Database is not publicly reachable.
- No secrets or patient data appear in logs.
- Backup restoration has been demonstrated.

### Phase 7: Pilot

- Use clinic-approved fictional data first.
- Conduct a privacy and security review.
- Pilot with 5–10 consenting adult patients.
- Monitor login failures, delivery failures, unauthorized attempts, and support
  issues without logging clinical content.

Exit criteria:

- Clinic approves data accuracy.
- No cross-patient access issue exists.
- Recovery and incident procedures are documented.
- The clinic's DPO approves production processing.

## 15. Required Automated Tests

Use `node:test` and Fastify `inject`.

### Authentication

- Name and patient-number normalization
- Known and unknown login start response equivalence
- Invalid request validation
- OTP digest is stored instead of plaintext
- Correct OTP succeeds
- Incorrect OTP increments attempts
- Sixth attempt cannot succeed when maximum is five
- Expired OTP fails
- Used OTP cannot be replayed
- Resend invalidates the prior code
- Session token digest is stored instead of plaintext
- Idle timeout
- Absolute timeout
- Logout revocation
- Required cookie attributes

### Authorization

- Unauthenticated requests return `401`
- Patient A receives only Patient A appointments
- Patient A cannot retrieve Patient B appointment by ID
- Patient A receives only Patient A records
- Patient A cannot retrieve Patient B record by ID
- Unpublished records and treatment plans remain hidden
- Disabled portal access cannot create a session

### API and deployment

- Health succeeds with database access
- Health fails readiness when the database is unavailable
- Protected responses include `Cache-Control: no-store`
- State-changing requests reject an invalid Origin
- SPA deep-link fallback returns the React application
- Production configuration rejects development secrets and SMS mode

## 16. Manual Verification Checklist

- Login works on a 320px-wide viewport.
- OTP input works with keyboard, paste, and screen readers.
- Sidebar opens and closes on mobile.
- Focus remains visible.
- Dates display correctly in Asia/Manila.
- Browser refresh works on every `/portal/*` route.
- Browser back/forward navigation works.
- Session expiry returns the patient to login without stale data.
- No patient data remains visible after logout.
- API responses contain no internal notes or unnecessary fields.
- Browser storage contains no tokens or patient records.
- Browser console has no errors.
- Application logs contain no name, patient number, phone, OTP, cookie, or
  clinical content.

## 17. Definition of Done

The MVP is complete only when:

1. A clinic-provisioned fictional patient can complete full-name, patient-ID,
   and OTP login.
2. The patient sees database-backed appointments, published records, and a
   published treatment plan.
3. No patient can access another patient's data by changing a URL, parameter,
   or request body.
4. OTP and session security tests pass.
5. All protected data uses no-store responses and secure server-side sessions.
6. The frontend passes production build and responsive visual checks.
7. Coolify deploys the Node application on port `3000` with private PostgreSQL.
8. Production refuses insecure or incomplete configuration.
9. Secrets and patient data do not appear in Git, browser storage, or logs.
10. Backup restoration, logout, expiration, and rollback are verified.
11. The clinic has approved the privacy notice, data workflow, recovery
    procedure, and patient-visible content.
12. The clinic's DPO has completed the required privacy assessment before real
    patient data is enabled.

## 18. Release Gates Requiring Product-Owner Input

The implementing AI may build with fictional data before these are answered,
but must not enable real patient data until the decisions are recorded:

1. What is the clinic's current source of patient records and schedules?
2. Does every pilot patient have a clinic-verified mobile number?
3. Which SMS provider will be used, and in which country will it process data?
4. Will the pilot contain minors or dependent patients?
5. Which exact clinical fields may be published to patients?
6. Who at the clinic publishes and corrects patient-visible summaries?
7. What is the lost-phone identity-verification procedure?
8. What are the clinic's retention and deletion rules?
9. Where will encrypted off-server backups be stored?
10. Who is the clinic's Data Protection Officer?

## 19. Security and Privacy References

- Philippine Data Privacy Act:
  https://privacy.gov.ph/data-privacy-act/
- NPC Circular 2023-06:
  https://privacy.gov.ph/wp-content/uploads/2024/03/NPC-Circular-Repeal-16-01-Signed.pdf
- NIST SP 800-63B:
  https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Authentication Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Authorization Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP IDOR Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html

This specification is a technical implementation plan. It does not replace
review by the clinic's Data Protection Officer or Philippine legal counsel.
