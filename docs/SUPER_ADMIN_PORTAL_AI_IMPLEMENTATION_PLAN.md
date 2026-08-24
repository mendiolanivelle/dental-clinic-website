# Super Admin Portal Implementation Plan

Status: MVP Phases 1–5 implemented; production super-admin account pending explicit owner-approved credentials

Audience: coding agents, product designers, clinic owners, and maintainers

Application: SmileCare Dental Clinic Portal

Last reviewed: 2026-08-24, Asia/Manila

## 1. Instruction to implementing AI

Treat this document as the product and implementation contract for the Super
Admin Portal. Preserve all existing patient, receptionist, and dentist portal
behavior unless this document explicitly changes it.

Before implementation:

1. inspect the current repository and migrations;
2. confirm the worktree is clean or preserve unrelated user changes;
3. create a phased implementation plan;
4. implement and test one phase at a time;
5. use forward-only database migrations;
6. never place Supabase management credentials or service-role keys in the
   frontend, repository, logs, or application responses; and
7. do not expose patient clinical information in business analytics.

When a requirement is ambiguous, use the recommended default in this document.
If no default is provided and the choice materially changes financial meaning,
privacy, or authorization, ask the product owner before coding.

Normative terms:

- `MUST` and `MUST NOT` are mandatory.
- `SHOULD` is the recommended default.
- `MAY` is optional and should not delay the MVP.

## 2. Product objective

Create a dedicated Super Admin Portal for the clinic owner to:

- monitor sales, collections, outstanding balances, appointments, and demand;
- understand which services are most commonly completed;
- compare weekly, monthly, and year-over-year performance;
- add, deactivate, and manage dentist and receptionist accounts;
- review clinic and doctor capacity without scoring clinical quality;
- set future business and appointment targets; and
- run meetings using a privacy-safe presentation view.

The portal is a business planning and meeting tool. It is not an accounting
system, payroll system, clinical decision system, or electronic medical record.

## 3. Confirmed product requirements

- Super admins use the existing Clinic Staff login form.
- Staff login accepts full name and password, not an email address.
- Successful login routes users by server-returned role.
- A super admin is routed to `/admin`.
- Dentists continue to route to `/dentist`.
- Receptionists continue to route to `/reception`.
- Super admins can add dentists and receptionists.
- The dashboard includes sales and collections information.
- The dashboard identifies commonly completed services.
- The portal provides weekly, monthly, side-by-side, and YoY comparisons.
- The portal provides a meeting-friendly view for owners, dentists, and staff.
- Financial and operational metrics use Asia/Manila calendar boundaries and PHP.

## 4. Current-system facts

The existing application already has:

- React, React Router, and Tailwind CSS frontend pages;
- Fastify same-origin API endpoints;
- private `dental_portal` PostgreSQL schema in Supabase;
- opaque staff sessions stored as token digests;
- staff roles named `receptionist`, `dentist`, and `admin`;
- name-based staff login backed internally by Supabase Auth;
- dentist profiles linked to staff profiles;
- patients, appointments, appointment types, charges, payments, clinical
  records, prescriptions, follow-ups, and audit events;
- reception billing and payment recording; and
- role routing for receptionist and dentist portals.

Current routing treats any non-dentist staff member as reception. The
implementation MUST change routing so the super-admin role cannot accidentally
inherit the reception portal merely because it is not a dentist.

Data inventory observed on 2026-08-24:

- 7 appointments;
- 5 completed appointments;
- 7 service types;
- 5 charges;
- 5 posted payments;
- PHP 4,500 billed and collected;
- 1 active dentist;
- 1 active receptionist; and
- no active administrator.

The available history is too short for meaningful monthly or YoY conclusions.
The UI MUST show an explicit insufficient-history state instead of presenting
empty or misleading comparisons.

## 5. Role model and authorization

### 5.1 Roles

Introduce or formalize these roles:

| Role | Portal | Purpose |
|---|---|---|
| `super_admin` | `/admin` | Owner-level business and account administration |
| `dentist` | `/dentist` | Assigned clinical patients and dentist operations |
| `receptionist` | `/reception` | Scheduling, patients, billing, and reception work |

Recommended default: create a distinct `super_admin` role instead of expanding
the current `admin` role. If backward compatibility requires retaining `admin`,
migrate approved admin profiles to `super_admin` and stop using `admin` for new
accounts.

### 5.2 Authorization matrix

| Capability | Super admin | Dentist | Receptionist |
|---|---:|---:|---:|
| View clinic-wide financial dashboard | Yes | No by default | No |
| View clinic-wide operational statistics | Yes | Meeting View only | Meeting View only |
| View doctor-level aggregate statistics | Yes | Own statistics only, future | No |
| Add or deactivate staff accounts | Yes | No | No |
| Reset staff passwords | Yes | No | No |
| Create another super admin | Existing super admin only | No | No |
| View audit log | Yes | No | No |
| View assigned patient clinical charts | Only through an authorized clinical role | Yes | Existing operational access only |
| Open full Meeting View | Yes | Shared view only | Shared view only |
| Set clinic targets | Yes | No by default | No |

All authorization MUST be enforced server-side. Hiding a menu item is not an
authorization control.

### 5.3 Super-admin account safeguards

- A super admin MUST have a unique normalized full-name login.
- Two active staff accounts MUST NOT share the same normalized login name.
- Creating another super admin SHOULD require password confirmation by an
  existing super admin.
- Super-admin sessions SHOULD have a shorter idle timeout than reception.
- Sensitive mutations MUST create audit events.
- Account deactivation MUST revoke active staff sessions.
- Existing passwords MUST never be displayed or recoverable.
- Password reset MUST issue or set a temporary password and SHOULD require a
  password change at next login.
- Production passwords SHOULD contain at least 12 characters.

## 6. Information architecture

Protected routes:

```text
/admin
/admin/sales
/admin/services
/admin/comparisons
/admin/doctors
/admin/team
/admin/goals
/admin/meeting
/admin/audit
```

MVP navigation:

1. Overview
2. Sales & Collections
3. Services
4. Comparisons
5. Doctors
6. Team Accounts
7. Meeting View
8. Audit Log

Goals & Planning MAY be hidden until targets and forecasting inputs are ready.

## 7. Global dashboard controls

Every analytics screen MUST use the same filter contract:

- date range;
- comparison mode;
- dentist filter;
- service filter; and
- clinic timezone fixed to `Asia/Manila`.

Preset date ranges:

- Today
- This week
- Last week
- This month
- Last month
- This quarter
- This year
- Custom range

Comparison modes:

- Previous equivalent period
- Previous month
- Same period last year
- None

Filters MUST be encoded in URL query parameters so a super admin can refresh,
bookmark, or share the same authorized view.

Responses and pages MUST display:

- selected date range;
- comparison date range;
- last refreshed timestamp; and
- whether the period is complete or still in progress.

## 8. Metric dictionary

Implement metrics exactly as defined here. Do not label cash collected as
profit or silently combine payment dates with service dates.

### 8.1 Financial metrics

#### Gross billed

```text
sum(patient_charges.subtotal_cents)
```

Group by the completed appointment's Manila service date. If a charge exists
for a non-completed appointment because of legacy data, include it in billing
but flag the data-quality issue for administrators.

#### Discounts

```text
sum(patient_charges.discount_cents)
```

Group on the same basis as billed value.

#### Net billed

```text
sum(patient_charges.total_cents)
```

The database already enforces `total = subtotal - discount`.

#### Cash collected

```text
sum(patient_payments.amount_cents)
where patient_payments.status = 'posted'
```

Group by `received_at` converted to Asia/Manila. Exclude voided payments.

#### Outstanding balance

For each charge:

```text
max(charge.total_cents - sum(posted payment amounts), 0)
```

Clinic outstanding balance is the sum of those charge balances. It is a
point-in-time value, not period revenue.

#### Average billed value per completed visit

```text
net billed for completed appointments / completed charged appointments
```

Show `—` when the denominator is zero.

#### Collection rate

Recommended MVP definition:

```text
posted payments associated with charges in the selected service period
/
net billed for those charges
```

Label this metric clearly as cohort collection rate. Do not divide payments
received during a period by unrelated charges created during that period.

### 8.2 Operational metrics

#### Completed visits

Count appointments with `status = 'completed'` by Manila appointment date.

#### Scheduled future visits

Count appointments with `status IN ('scheduled', 'confirmed')` and a future
`starts_at`.

#### Cancellation rate

```text
cancelled / (completed + cancelled + no_show)
```

Exclude future scheduled and confirmed appointments from the denominator.

#### No-show rate

```text
no_show / (completed + cancelled + no_show)
```

#### Service volume

Count completed appointments grouped by `appointment_type_id`. Do not group by
free-text charge descriptions or clinical procedure names.

#### Service mix percentage

```text
completed visits for service / all completed visits
```

#### New patients

Count patients whose `created_at` falls in the selected period. Label this
`New patient profiles`, because profile creation is not necessarily the first
completed visit.

#### Returning patients

Recommended future definition: patients with a completed visit during the
selected period and at least one completed visit before the period start.

#### Doctor utilization

Do not implement until individual doctor working hours and time-off are stored.
When available:

```text
completed appointment minutes / available working minutes
```

Do not use the clinic's generic opening hours as a substitute for a doctor's
actual availability.

## 9. Comparison rules

### 9.1 Weekly

- Weeks run Monday 00:00 through Sunday 23:59:59 in Asia/Manila.
- Compare a selected week with the immediately preceding week.
- For the current incomplete week, compare only through the equivalent weekday
  and time in the previous week.

### 9.2 Monthly side-by-side

- Show the selected month beside the immediately preceding calendar month.
- Show headline totals and daily cumulative trend lines.
- For the current incomplete month, compare equal elapsed-day windows.
- Do not compare 10 elapsed days with a full prior month.

### 9.3 Year over year

- Compare the selected period with the corresponding prior-year calendar
  period in Asia/Manila.
- A current incomplete period uses the same elapsed cutoff in the prior year.
- If there is no comparable prior-year data, show `Not enough history yet`.

### 9.4 Delta display

For every comparable metric return or compute:

```text
currentValue
comparisonValue
absoluteChange = currentValue - comparisonValue
percentageChange = absoluteChange / comparisonValue * 100
```

Rules:

- comparison zero and current positive: display `New`, not infinity;
- both values zero: display `No change`;
- no comparison data: display `Not enough history`;
- negative changes are not always bad; color depends on the metric;
- higher cancellations, no-shows, outstanding balances, or discounts SHOULD use
  warning colors; and
- financial values are formatted as PHP from integer cents.

## 10. Screen requirements

### 10.1 Overview

Purpose: answer `How is the clinic doing, and what needs attention?`

Required content:

- Cash collected
- Net billed
- Outstanding balance
- Completed visits
- Average billed value per completed visit
- Comparison badge on each comparable KPI
- Sales/collections trend chart
- Completed-service trend chart
- Top five completed services
- Appointment status summary
- Doctor workload summary
- Action alerts

Action alerts SHOULD include:

- overdue unpaid or partially paid charges;
- unusually high cancellations or no-shows;
- no comparable data;
- incomplete account links;
- inactive service or dentist referenced by future bookings; and
- data-quality inconsistencies.

### 10.2 Sales & Collections

Required content:

- gross billed;
- discounts;
- net billed;
- cash collected;
- outstanding balance;
- collection rate;
- payment-method mix;
- billed versus collected trend; and
- aging summary for outstanding balances.

The MVP MAY link to existing reception billing records, but the admin analytics
response MUST NOT include patient phone numbers or clinical details.

Do not show profit, net income, payroll, or expense metrics until those data
sources exist.

### 10.3 Services

Required content:

- ranked completed-service count;
- service mix percentage;
- billed value by service;
- average billed value by service;
- weekly/monthly trend by service;
- doctor filter; and
- minimum-volume warning when interpreting percentage changes.

Ranking MUST default to completed-service count. Booked or requested services
may be shown as a separate demand view, clearly labeled.

### 10.4 Comparisons

Required modes:

- current week versus previous week;
- current month versus previous month;
- selected year month-by-month versus previous year; and
- custom range versus previous equivalent period.

Use grouped bars or side-by-side tables for exact comparison. Use line charts
for trends. Every chart MUST have a text or table equivalent for accessibility.

### 10.5 Doctors

Required content:

- active/inactive dentist list;
- completed visits by dentist;
- upcoming scheduled visits;
- service mix by dentist;
- billed value linked to that dentist's completed appointments;
- cancellation/no-show counts; and
- incomplete staff-to-dentist link warnings.

This screen measures workload and business activity only. It MUST NOT label a
doctor `best`, `worst`, or assign a clinical quality score.

### 10.6 Team Accounts

Required list fields:

- display name;
- role;
- active status;
- linked dentist, when applicable;
- created date;
- last successful login, when available; and
- account actions.

Required actions:

- add dentist;
- add receptionist;
- deactivate account;
- reactivate account;
- reset password;
- revoke active sessions; and
- view account audit history.

Dentist creation MUST atomically create or link:

1. the internal authentication identity;
2. the staff profile with role `dentist`; and
3. the clinical dentist profile.

Receptionist creation MUST create:

1. the internal authentication identity; and
2. the staff profile with role `receptionist`.

If any required step fails, the operation MUST roll back or compensate so no
orphaned active account remains.

The API MUST never return the hidden internal email used by Supabase Auth.

### 10.7 Meeting View

Purpose: support owner, doctor, and staff meetings without exposing patient
identities or account-management controls.

Required content:

- clinic name and reporting period;
- last refreshed timestamp;
- KPI summary;
- weekly or monthly trend;
- top services;
- doctor workload/capacity summary;
- wins;
- risks requiring attention; and
- targets and action items when available.

Required privacy behavior:

- no patient names;
- no patient IDs;
- no phone numbers;
- no prescriptions;
- no medical alerts or clinical histories;
- no staff passwords or reset controls; and
- no drill-down into individual patients.

Recommended default: only a super admin can configure and open Meeting View.
Dentists and receptionists may receive a separately authorized read-only
meeting route in a later phase.

Meeting View SHOULD support fullscreen and print-friendly presentation. PDF
export MAY be added after the web view is complete and verified.

### 10.8 Audit Log

Required audited events:

- super-admin login success/failure;
- dashboard and report access;
- staff account created;
- role changed;
- account activated/deactivated;
- password reset initiated/completed;
- sessions revoked;
- targets changed; and
- report exported.

Audit events MUST record actor, action, target identifier when appropriate,
timestamp, request ID, and privacy-safe request metadata. Do not store raw
passwords, session tokens, financial report contents, patient names, or
clinical content in audit metadata.

## 11. Goals and forecasting

Goals are Phase 3, not an MVP dependency.

Supported goals MAY include:

- monthly cash-collected target;
- monthly net-billed target;
- completed-visit target;
- cancellation-rate ceiling; and
- service-specific volume target.

Each goal requires:

- metric key;
- target value;
- start and end dates;
- optional service or dentist scope;
- created-by staff ID;
- created and updated timestamps; and
- audit history.

Forecasting MUST NOT be presented as reliable until the system stores:

- service price history with effective dates;
- individual doctor working schedules and time off;
- enough historical appointment and payment data; and
- refund/adjustment behavior if refunds occur in the clinic.

Initial forecast language SHOULD say `projection based on scheduled visits`,
not `expected profit`.

## 12. Data and schema planning

The implementing AI SHOULD prefer aggregate SQL queries or dedicated reporting
views over loading raw records and aggregating them in the browser.

Likely forward-only schema work:

- add `super_admin` to the staff role constraint;
- add account lifecycle fields such as `last_login_at` and
  `password_change_required` if the chosen authentication workflow supports
  them safely;
- add doctor availability tables before utilization reporting;
- add goal tables before Goals & Planning;
- add service price history before financial forecasting; and
- add refunds/adjustments before claiming net cash after refunds.

Do not duplicate financial facts into analytics tables for the MVP. Query
charges, posted payments, appointments, services, dentists, and staff profiles
as the sources of truth.

If performance later requires materialized summaries:

- summaries MUST be reproducible from source records;
- refresh state MUST be visible;
- stale data MUST be labeled; and
- source financial records MUST remain immutable except through authorized
  business operations.

## 13. Conceptual API contract

Exact response schemas may be refined during implementation, but routes SHOULD
follow this boundary:

```text
GET  /api/admin/overview
GET  /api/admin/sales
GET  /api/admin/services
GET  /api/admin/comparisons
GET  /api/admin/doctors
GET  /api/admin/team
POST /api/admin/team/dentists
POST /api/admin/team/receptionists
POST /api/admin/team/:id/deactivate
POST /api/admin/team/:id/reactivate
POST /api/admin/team/:id/reset-password
POST /api/admin/team/:id/revoke-sessions
GET  /api/admin/meeting
GET  /api/admin/audit
```

Common analytics query parameters:

```text
from=YYYY-MM-DD
to=YYYY-MM-DD
compare=previous_period|previous_month|year_over_year|none
dentistId=<uuid optional>
serviceId=<uuid optional>
```

Requirements:

- reject unknown query/body properties;
- validate UUIDs and dates;
- limit custom date-range size;
- return `Cache-Control: no-store`;
- return aggregate results unless a route explicitly requires records;
- never accept a role from the browser as authorization evidence;
- use the authenticated staff session for actor identity; and
- use generic authentication errors.

## 14. Privacy and security constraints

Patient health information is sensitive personal information under the
Philippine Data Privacy Act. Analytics MUST follow transparency, legitimate
purpose, proportionality, least privilege, and appropriate security measures.

Official references:

- https://privacy.gov.ph/data-privacy-act/
- https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/

Mandatory controls:

- business dashboards use aggregates whenever individual data is unnecessary;
- Meeting View contains no patient identifiers;
- financial drill-down does not reveal clinical notes or prescriptions;
- account administration is super-admin-only;
- all protected endpoints authenticate and authorize on the server;
- state-changing requests enforce the configured same-origin policy;
- responses containing clinic business data are not cached publicly;
- database access uses the existing least-privilege runtime role;
- migrations preserve RLS and revoke access from Supabase API roles;
- logs exclude passwords, tokens, patient information, and report payloads; and
- high-risk mutations are audited.

## 15. UX requirements

- Match the existing SmileCare visual system and responsive layout.
- Desktop is the primary analytics and meeting experience.
- Mobile must remain usable for KPI review and staff account emergencies.
- Use cards for headline metrics, bars for discrete comparisons, lines for
  time trends, and tables where exact values matter.
- Do not rely on color alone to communicate change.
- Show loading, empty, unavailable, insufficient-history, and permission-denied
  states explicitly.
- Every chart needs a title, period, units, legend, and accessible text/table
  alternative.
- Currency uses Philippine peso formatting.
- Dates and periods use Asia/Manila.
- Large percentages based on very small counts SHOULD show a low-volume note.
- Destructive account actions require confirmation and state their effect.

## 16. Edge cases

The implementation MUST handle:

- no transactions in the selected period;
- current period with no comparison history;
- comparison denominator equal to zero;
- partial current week/month/year;
- late payments for earlier charges;
- partially paid charges;
- voided payments;
- discounts greater than usual but still valid;
- inactive doctors with historical appointments;
- renamed services and doctors;
- staff with duplicate-looking names;
- dentist staff profile missing its dentist link;
- user timezone differing from clinic timezone;
- future scheduled appointments; and
- data-quality inconsistencies without breaking the entire dashboard.

## 17. MVP scope

MVP includes:

- distinct super-admin authorization and routing;
- admin layout and navigation;
- Overview;
- Sales & Collections;
- Services;
- weekly and monthly comparisons;
- YoY insufficient-history behavior and eventual YoY calculations;
- Doctors aggregate screen;
- Team Accounts for dentist and receptionist provisioning;
- Meeting View;
- audit events;
- automated backend, frontend, authorization, and metric tests; and
- production build verification.

MVP excludes:

- expense accounting;
- profit or net-income reporting;
- payroll and commissions;
- inventory;
- tax reporting;
- AI-generated business recommendations;
- clinical quality scoring;
- patient-level Meeting View content;
- multi-branch reporting;
- public report links;
- automatic email/SMS invitations; and
- predictive forecasting.

## 18. Phased implementation order

### Phase 1: authorization foundation

1. Add the super-admin role through a forward migration.
2. Add strict admin route guards.
3. Update login routing to `/admin` for super admins.
4. Add the admin layout and empty route shells.
5. Add authorization and role-routing tests.

Exit criteria: super admins can access only `/admin`; dentists and receptionists
cannot call admin APIs; existing portals still work.

### Phase 2: team administration

1. Add team listing.
2. Add dentist provisioning with clinical-profile linkage.
3. Add receptionist provisioning.
4. Add deactivate/reactivate, password reset, and session revocation.
5. Add audit events and failure rollback/compensation tests.

Exit criteria: account lifecycle operations are safe, audited, role-restricted,
and never expose internal Auth email addresses.

### Phase 3: analytics foundation

1. Implement shared date/filter parsing.
2. Implement the metric dictionary in database queries.
3. Add overview, sales, service, and doctor aggregate APIs.
4. Add timezone, partial-period, voided-payment, and zero-denominator tests.

Exit criteria: aggregate API results reconcile with source data and metric
definitions.

### Phase 4: analytics UI and comparisons

1. Build Overview.
2. Build Sales & Collections.
3. Build Services and Doctors.
4. Build weekly, monthly, and YoY comparison views.
5. Add loading, empty, error, and insufficient-history states.

Exit criteria: dashboards are responsive, accessible, and use consistent
filters and definitions.

### Phase 5: Meeting View

1. Build privacy-safe presentation mode.
2. Add fullscreen and print styling.
3. Verify that no patient identifier or clinical field is returned or rendered.
4. Add meeting-view authorization and privacy tests.

Exit criteria: the owner can present clinic performance without exposing
patient or account-management information.

### Phase 6: goals and forecasting prerequisites

Implement only after the owner approves target definitions, price history,
doctor schedules, and refund handling.

## 19. Acceptance criteria

The Super Admin Portal is ready only when all are true:

- A super admin logging in by name is routed to `/admin`.
- Receptionists and dentists cannot access admin pages or APIs.
- Super admins can safely add, deactivate, reactivate, and reset dentist and
  receptionist accounts.
- Dentist creation always produces a valid staff-to-dentist link.
- The UI never exposes the internal Auth email address.
- Cash collected excludes voided payments and uses payment dates.
- Billed values use charge amounts and completed-service context.
- Common service statistics use completed appointment types.
- Weekly comparisons use Manila Monday–Sunday periods.
- Partial periods compare equal elapsed windows.
- YoY displays insufficient history when appropriate.
- Zero comparison values never produce Infinity or NaN.
- Meeting View contains no patient identifier or clinical information.
- No dashboard labels a financial value as profit.
- High-risk account actions are audited.
- Existing patient, reception, and dentist tests continue to pass.
- New authorization, metrics, account lifecycle, and privacy tests pass.
- The production frontend build succeeds.
- No secret, management token, password, or service-role key is committed.

## 20. Product decisions required before Phase 6

Use these defaults unless the owner changes them:

| Decision | Recommended default |
|---|---|
| Can dentists see full clinic financials? | No; only owner-authorized Meeting View summaries |
| Can receptionists see full clinic financials? | No |
| Can super admins view patient charts from admin analytics? | No direct patient drill-down |
| Can one super admin create another? | Yes, with password confirmation and audit |
| Definition of sales headline | Show Net billed and Cash collected separately |
| Week boundary | Monday–Sunday, Asia/Manila |
| Current-period comparison | Equal elapsed time window |
| Service popularity | Completed appointment count |
| Doctor ranking | Do not rank clinical quality |
| Meeting View patient data | Aggregates only; no identifiers |
| Password policy for new accounts | Temporary password, 12+ characters, change required |
| Profit reporting | Out of scope until expenses and refunds are modeled |

## 21. Final implementation handoff requirements

The implementing AI must report:

- phases completed;
- migrations applied;
- routes and screens added;
- exact metric definitions implemented;
- privacy and authorization tests performed;
- test and build results;
- any remaining data limitations;
- commit identifier; and
- whether the commit was pushed to GitHub.

Do not claim YoY insight, utilization, forecast accuracy, or profit reporting
unless their documented prerequisites are satisfied.
