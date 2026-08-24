CREATE TABLE IF NOT EXISTS appointment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  appointment_type_id uuid NOT NULL REFERENCES appointment_types(id),
  preferred_date date NOT NULL,
  time_preference text NOT NULL DEFAULT 'any' CHECK (
    time_preference IN ('any', 'morning', 'afternoon')
  ),
  patient_note text,
  status text NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'confirmed', 'declined', 'cancelled', 'completed')
  ),
  clinic_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_requests_patient_created_idx
  ON appointment_requests (patient_id, created_at DESC);

INSERT INTO appointment_types (name, default_duration_minutes, patient_description)
VALUES
  ('Cleaning', 45, 'A gentle professional cleaning to remove plaque and help protect your teeth and gums.'),
  ('Brace Adjustment', 30, 'A regular orthodontic visit to check progress and adjust your braces safely.'),
  ('Routine Checkup', 30, 'A complete oral exam to keep your smile healthy and catch concerns early.'),
  ('Consultation', 30, 'A focused visit to discuss your concerns and the right care plan for your smile.'),
  ('Extraction', 60, 'Comfort-focused tooth removal when a tooth cannot be safely restored.'),
  ('Filling', 45, 'Restore a damaged tooth and make everyday eating comfortable again.'),
  ('Teeth Whitening', 60, 'Brighten your smile with a treatment plan selected for your teeth.')
ON CONFLICT (name) DO NOTHING;

GRANT SELECT, INSERT ON dental_portal.appointment_requests TO dental_portal_backend;

ALTER TABLE dental_portal.appointment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.appointment_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.appointment_requests
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);
