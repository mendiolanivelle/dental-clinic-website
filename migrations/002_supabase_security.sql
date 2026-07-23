CREATE SCHEMA IF NOT EXISTS dental_portal;

ALTER TABLE IF EXISTS public.patients SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.dentists SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.appointment_types SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.appointments SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.treatment_plans SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.clinical_records SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.login_challenges SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.portal_sessions SET SCHEMA dental_portal;
ALTER TABLE IF EXISTS public.audit_events SET SCHEMA dental_portal;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'dental_portal_backend'
  ) THEN
    CREATE ROLE dental_portal_backend
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'dental_portal_backend'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Existing dental_portal_backend role has unsafe attributes';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON SCHEMA dental_portal FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA dental_portal FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SCHEMA dental_portal FROM %I',
        api_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA dental_portal FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA dental_portal TO dental_portal_backend;
GRANT SELECT
  ON dental_portal.patients,
     dental_portal.dentists,
     dental_portal.appointment_types,
     dental_portal.appointments,
     dental_portal.treatment_plans,
     dental_portal.clinical_records
  TO dental_portal_backend;
GRANT SELECT, INSERT, UPDATE
  ON dental_portal.login_challenges,
     dental_portal.portal_sessions
  TO dental_portal_backend;
GRANT INSERT
  ON dental_portal.audit_events
  TO dental_portal_backend;

ALTER TABLE dental_portal.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.patients FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.patients
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.dentists ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.dentists FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.dentists
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.appointment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.appointment_types FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.appointment_types
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.appointments
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.treatment_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.treatment_plans
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.clinical_records FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.clinical_records
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.login_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.login_challenges
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.portal_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.portal_sessions
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.audit_events
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);
