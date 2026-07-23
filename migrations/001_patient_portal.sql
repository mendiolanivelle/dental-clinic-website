CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_number text UNIQUE NOT NULL,
  display_name text NOT NULL,
  normalized_name text NOT NULL,
  phone_e164 text NOT NULL,
  phone_verified_at timestamptz NOT NULL,
  portal_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dentists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  specialty text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS appointment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  default_duration_minutes integer NOT NULL CHECK (default_duration_minutes > 0),
  patient_description text
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  dentist_id uuid NOT NULL REFERENCES dentists(id),
  appointment_type_id uuid NOT NULL REFERENCES appointment_types(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (
    status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
  ),
  patient_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  title text NOT NULL,
  patient_summary text NOT NULL,
  status text NOT NULL,
  started_on date,
  recommended_interval_days integer CHECK (
    recommended_interval_days IS NULL OR recommended_interval_days > 0
  ),
  next_recommended_on date,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  dentist_id uuid NOT NULL REFERENCES dentists(id),
  appointment_id uuid REFERENCES appointments(id),
  procedure_name text NOT NULL,
  treated_on date NOT NULL,
  patient_summary text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),
  code_digest text,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  used_at timestamptz,
  lookup_digest text NOT NULL,
  ip_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (patient_id IS NULL AND code_digest IS NULL)
    OR (patient_id IS NOT NULL AND code_digest IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  token_digest text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (absolute_expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  object_type text,
  object_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  ip_digest text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS patients_portal_lookup_idx
  ON patients (patient_number, normalized_name)
  WHERE portal_enabled = true;
CREATE INDEX IF NOT EXISTS appointments_patient_starts_idx
  ON appointments (patient_id, starts_at);
CREATE INDEX IF NOT EXISTS clinical_records_patient_published_idx
  ON clinical_records (patient_id, treated_on DESC)
  WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS treatment_plans_patient_published_idx
  ON treatment_plans (patient_id, updated_at DESC)
  WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS login_challenges_expires_idx
  ON login_challenges (expires_at);
CREATE INDEX IF NOT EXISTS login_challenges_lookup_created_idx
  ON login_challenges (lookup_digest, created_at DESC);
CREATE INDEX IF NOT EXISTS login_challenges_ip_created_idx
  ON login_challenges (ip_digest, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_sessions_active_token_idx
  ON portal_sessions (token_digest)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_events_occurred_idx
  ON audit_events (occurred_at DESC);
