CREATE TABLE dental_portal.social_brand_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id smallint NOT NULL DEFAULT 1 REFERENCES dental_portal.social_brand_settings(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (settings_id = 1)
);

CREATE INDEX social_brand_templates_created_idx
  ON dental_portal.social_brand_templates (created_at, id);

GRANT SELECT, INSERT, DELETE ON dental_portal.social_brand_templates TO dental_portal_backend;

ALTER TABLE dental_portal.social_brand_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.social_brand_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access ON dental_portal.social_brand_templates
  FOR ALL TO dental_portal_backend USING (true) WITH CHECK (true);

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.social_brand_templates FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
