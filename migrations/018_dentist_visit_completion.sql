ALTER TABLE dental_portal.appointments
  ADD COLUMN dentist_done_at timestamptz,
  ADD COLUMN dentist_done_by_staff_id uuid REFERENCES dental_portal.staff_profiles(id),
  ADD COLUMN proposed_fee_cents integer,
  ADD CONSTRAINT appointments_dentist_completion_check CHECK (
    (dentist_done_at IS NULL AND dentist_done_by_staff_id IS NULL AND proposed_fee_cents IS NULL)
    OR
    (dentist_done_at IS NOT NULL AND dentist_done_by_staff_id IS NOT NULL AND proposed_fee_cents > 0)
  );

CREATE INDEX appointments_awaiting_billing_idx
  ON dental_portal.appointments (dentist_done_at)
  WHERE dentist_done_at IS NOT NULL AND status IN ('scheduled', 'confirmed');
