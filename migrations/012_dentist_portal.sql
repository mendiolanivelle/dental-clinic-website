ALTER TABLE dental_portal.staff_profiles
  ADD COLUMN dentist_id uuid REFERENCES dental_portal.dentists(id);

CREATE UNIQUE INDEX staff_profiles_dentist_unique_idx
  ON dental_portal.staff_profiles (dentist_id)
  WHERE dentist_id IS NOT NULL AND role = 'dentist';

ALTER TABLE dental_portal.patients
  ADD COLUMN allergies text,
  ADD COLUMN medical_conditions text,
  ADD COLUMN current_medications text,
  ADD COLUMN medical_history_reviewed_at timestamptz,
  ADD CONSTRAINT patients_allergies_length_check CHECK (
    allergies IS NULL OR length(allergies) <= 2000
  ),
  ADD CONSTRAINT patients_medical_conditions_length_check CHECK (
    medical_conditions IS NULL OR length(medical_conditions) <= 2000
  ),
  ADD CONSTRAINT patients_current_medications_length_check CHECK (
    current_medications IS NULL OR length(current_medications) <= 2000
  );

CREATE TABLE dental_portal.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES dental_portal.patients(id),
  dentist_id uuid NOT NULL REFERENCES dental_portal.dentists(id),
  appointment_id uuid REFERENCES dental_portal.appointments(id),
  created_by_staff_id uuid NOT NULL REFERENCES dental_portal.staff_profiles(id),
  prescribed_on date NOT NULL,
  generic_name text NOT NULL CHECK (length(generic_name) BETWEEN 1 AND 240),
  instructions text NOT NULL CHECK (length(instructions) BETWEEN 1 AND 2000),
  image_mime_type text NOT NULL CHECK (
    image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  image_original_name text NOT NULL CHECK (length(image_original_name) BETWEEN 1 AND 160),
  image_byte_size integer NOT NULL CHECK (image_byte_size BETWEEN 1 AND 5242880),
  image_sha256 char(64) NOT NULL,
  image_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dental_portal.follow_up_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES dental_portal.patients(id),
  dentist_id uuid NOT NULL REFERENCES dental_portal.dentists(id),
  appointment_type_id uuid REFERENCES dental_portal.appointment_types(id),
  created_by_staff_id uuid NOT NULL REFERENCES dental_portal.staff_profiles(id),
  recommended_on date NOT NULL,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'scheduled', 'completed', 'cancelled')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prescriptions_patient_created_idx
  ON dental_portal.prescriptions (patient_id, created_at DESC);
CREATE INDEX follow_up_recommendations_patient_date_idx
  ON dental_portal.follow_up_recommendations (patient_id, recommended_on DESC);
CREATE INDEX follow_up_recommendations_pending_idx
  ON dental_portal.follow_up_recommendations (recommended_on ASC)
  WHERE status = 'pending';

GRANT SELECT, INSERT
  ON dental_portal.prescriptions, dental_portal.follow_up_recommendations
  TO dental_portal_backend;

ALTER TABLE dental_portal.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.prescriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.prescriptions
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.follow_up_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.follow_up_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.follow_up_recommendations
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.prescriptions FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON dental_portal.follow_up_recommendations FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
