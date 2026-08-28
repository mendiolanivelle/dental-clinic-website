CREATE TABLE dental_portal.social_brand_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  clinic_name text NOT NULL DEFAULT 'SmileCare Dental Clinic' CHECK (length(clinic_name) BETWEEN 2 AND 160),
  primary_color text NOT NULL DEFAULT '#176B68' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text NOT NULL DEFAULT '#DFF3EF' CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_family text NOT NULL DEFAULT 'Arial' CHECK (font_family IN ('Arial', 'Georgia', 'Verdana')),
  brand_voice text NOT NULL DEFAULT 'Warm, professional, educational, and concise' CHECK (length(brand_voice) BETWEEN 2 AND 500),
  default_language text NOT NULL DEFAULT 'taglish' CHECK (default_language IN ('english', 'filipino', 'taglish')),
  contact_phone text CHECK (contact_phone IS NULL OR length(contact_phone) <= 80),
  address text CHECK (address IS NULL OR length(address) <= 300),
  default_call_to_action text CHECK (default_call_to_action IS NULL OR length(default_call_to_action) <= 300),
  default_hashtags text[] NOT NULL DEFAULT '{}',
  required_disclaimer text CHECK (required_disclaimer IS NULL OR length(required_disclaimer) <= 500),
  prohibited_phrases text[] NOT NULL DEFAULT '{}',
  patient_posts_enabled boolean NOT NULL DEFAULT false,
  minor_posts_enabled boolean NOT NULL DEFAULT false,
  automatic_publishing_enabled boolean NOT NULL DEFAULT false,
  daily_post_limit integer NOT NULL DEFAULT 3 CHECK (daily_post_limit BETWEEN 1 AND 25),
  weekly_post_limit integer NOT NULL DEFAULT 12 CHECK (weekly_post_limit BETWEEN 1 AND 100),
  posting_start_hour integer NOT NULL DEFAULT 7 CHECK (posting_start_hour BETWEEN 0 AND 23),
  posting_end_hour integer NOT NULL DEFAULT 21 CHECK (posting_end_hour BETWEEN 0 AND 23),
  logo_drive_file_id text,
  logo_mime_type text CHECK (logo_mime_type IS NULL OR logo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((logo_drive_file_id IS NULL) = (logo_mime_type IS NULL)),
  CHECK (posting_start_hour <> posting_end_hour)
);

INSERT INTO dental_portal.social_brand_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE dental_portal.social_page_connections (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL DEFAULT 'meta' CHECK (provider = 'meta'),
  page_id text NOT NULL CHECK (length(page_id) BETWEEN 1 AND 100),
  page_name text NOT NULL CHECK (length(page_name) BETWEEN 1 AND 200),
  encrypted_access_token text,
  connection_status text NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'expired', 'disconnected', 'error')),
  connected_by_staff_id uuid NOT NULL REFERENCES dental_portal.staff_profiles(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (connection_status <> 'connected' OR encrypted_access_token IS NOT NULL)
);

CREATE TABLE dental_portal.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dentist_id uuid NOT NULL REFERENCES dental_portal.dentists(id),
  created_by_staff_id uuid NOT NULL REFERENCES dental_portal.staff_profiles(id),
  patient_id uuid REFERENCES dental_portal.patients(id),
  content_type text NOT NULL CHECK (content_type IN (
    'clinic_team', 'educational', 'facility_equipment', 'patient_portrait',
    'before_after', 'intraoral_clinical', 'other'
  )),
  original_description text NOT NULL CHECK (length(original_description) BETWEEN 2 AND 2000),
  original_image_drive_file_id text NOT NULL,
  original_image_mime_type text NOT NULL CHECK (original_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  original_image_name text NOT NULL CHECK (length(original_image_name) BETWEEN 1 AND 160),
  original_image_sha256 char(64) NOT NULL,
  final_image_drive_file_id text,
  final_image_mime_type text CHECK (final_image_mime_type IS NULL OR final_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  generated_caption text CHECK (generated_caption IS NULL OR length(generated_caption) <= 5000),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'confirmed', 'ai_processing', 'branding', 'automatic_validation',
    'publishing', 'published', 'blocked', 'failed', 'removed'
  )),
  blocking_reason text CHECK (blocking_reason IS NULL OR length(blocking_reason) <= 1000),
  idempotency_key uuid UNIQUE NOT NULL,
  external_post_id text,
  external_post_url text,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 10),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  published_at timestamptz,
  failed_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((final_image_drive_file_id IS NULL) = (final_image_mime_type IS NULL))
);

CREATE TABLE dental_portal.social_post_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_post_id uuid UNIQUE NOT NULL REFERENCES dental_portal.social_posts(id),
  patient_id uuid NOT NULL REFERENCES dental_portal.patients(id),
  consent_evidence text NOT NULL CHECK (length(consent_evidence) BETWEEN 2 AND 500),
  covers_public_social_media boolean NOT NULL,
  covers_ai_processing boolean NOT NULL,
  subject_is_minor boolean NOT NULL DEFAULT false,
  guardian_name text CHECK (guardian_name IS NULL OR length(guardian_name) <= 160),
  granted_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  recorded_by_staff_id uuid NOT NULL REFERENCES dental_portal.staff_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dental_portal.social_post_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_post_id uuid NOT NULL REFERENCES dental_portal.social_posts(id),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 2 AND 80),
  previous_status text,
  new_status text,
  actor_type text NOT NULL CHECK (actor_type IN ('staff', 'system', 'provider')),
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX social_posts_staff_created_idx
  ON dental_portal.social_posts (created_by_staff_id, created_at DESC);
CREATE INDEX social_posts_processing_idx
  ON dental_portal.social_posts (next_attempt_at, created_at)
  WHERE status IN ('confirmed', 'failed');
CREATE INDEX social_post_events_post_created_idx
  ON dental_portal.social_post_events (social_post_id, created_at);

GRANT SELECT, INSERT, UPDATE ON
  dental_portal.social_brand_settings,
  dental_portal.social_page_connections,
  dental_portal.social_posts,
  dental_portal.social_post_consents,
  dental_portal.social_post_events
TO dental_portal_backend;

ALTER TABLE dental_portal.social_brand_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.social_brand_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access ON dental_portal.social_brand_settings
  FOR ALL TO dental_portal_backend USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.social_page_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.social_page_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access ON dental_portal.social_page_connections
  FOR ALL TO dental_portal_backend USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.social_posts FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access ON dental_portal.social_posts
  FOR ALL TO dental_portal_backend USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.social_post_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.social_post_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access ON dental_portal.social_post_consents
  FOR ALL TO dental_portal_backend USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.social_post_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.social_post_events FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access ON dental_portal.social_post_events
  FOR ALL TO dental_portal_backend USING (true) WITH CHECK (true);

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.social_brand_settings FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.social_page_connections FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.social_posts FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.social_post_consents FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.social_post_events FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
