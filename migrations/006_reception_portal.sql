CREATE TABLE IF NOT EXISTS staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('receptionist', 'dentist', 'admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff_profiles(id),
  token_digest text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (absolute_expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS staff_sessions_active_token_idx
  ON staff_sessions (token_digest)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_dentist_slot_active_idx
  ON appointments (dentist_id, starts_at)
  WHERE status IN ('scheduled', 'confirmed');

GRANT SELECT ON dental_portal.staff_profiles TO dental_portal_backend;
GRANT SELECT, INSERT, UPDATE ON dental_portal.staff_sessions TO dental_portal_backend;
GRANT SELECT, INSERT, UPDATE ON dental_portal.appointment_requests TO dental_portal_backend;
GRANT SELECT, INSERT, UPDATE ON dental_portal.appointments TO dental_portal_backend;

ALTER TABLE dental_portal.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.staff_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.staff_profiles
  FOR SELECT TO dental_portal_backend
  USING (true);

ALTER TABLE dental_portal.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.staff_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.staff_sessions
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);
