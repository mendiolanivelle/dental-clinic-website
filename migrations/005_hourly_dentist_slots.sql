ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS dentist_id uuid REFERENCES dentists(id),
  ADD COLUMN IF NOT EXISTS requested_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_end_at timestamptz;

ALTER TABLE appointment_requests
  ADD CONSTRAINT appointment_requests_exact_slot_check CHECK (
    (dentist_id IS NULL AND requested_start_at IS NULL AND requested_end_at IS NULL)
    OR
    (
      dentist_id IS NOT NULL
      AND requested_start_at IS NOT NULL
      AND requested_end_at = requested_start_at + interval '1 hour'
    )
  );

INSERT INTO dentists (id, display_name, specialty, active)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'Dr. Amara Villanueva', 'General Dentistry', true),
  ('21000000-0000-4000-8000-000000000002', 'Dr. Mateo Rivera', 'Orthodontics', true),
  ('21000000-0000-4000-8000-000000000003', 'Dr. Celeste Navarro', 'Restorative and Cosmetic Dentistry', true)
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS appointment_requests_dentist_slot_active_idx
  ON appointment_requests (dentist_id, requested_start_at)
  WHERE dentist_id IS NOT NULL
    AND status IN ('requested', 'confirmed');
