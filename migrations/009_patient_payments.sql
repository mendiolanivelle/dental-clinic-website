CREATE TABLE IF NOT EXISTS patient_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  appointment_id uuid UNIQUE NOT NULL REFERENCES appointments(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  description text NOT NULL,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents > 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents > 0),
  status text NOT NULL DEFAULT 'unpaid' CHECK (
    status IN ('unpaid', 'partially_paid', 'paid')
  ),
  invoice_reference text,
  created_by_staff_id uuid NOT NULL REFERENCES staff_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_cents = subtotal_cents - discount_cents)
);

CREATE TABLE IF NOT EXISTS patient_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES patient_charges(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  method text NOT NULL CHECK (
    method IN ('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'other')
  ),
  external_reference text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  recorded_by_staff_id uuid NOT NULL REFERENCES staff_profiles(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  voided_by_staff_id uuid REFERENCES staff_profiles(id),
  voided_at timestamptz,
  void_reason text,
  CHECK (
    (status = 'posted' AND voided_by_staff_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status = 'voided' AND voided_by_staff_id IS NOT NULL AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS patient_charges_patient_created_idx
  ON patient_charges (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_charges_status_created_idx
  ON patient_charges (status, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_payments_charge_received_idx
  ON patient_payments (charge_id, received_at DESC);
CREATE INDEX IF NOT EXISTS patient_payments_received_idx
  ON patient_payments (received_at DESC)
  WHERE status = 'posted';

GRANT SELECT, INSERT, UPDATE
  ON dental_portal.patient_charges, dental_portal.patient_payments
  TO dental_portal_backend;
GRANT USAGE, SELECT
  ON SEQUENCE dental_portal.patient_charges_payment_record_number_seq
  TO dental_portal_backend;

ALTER TABLE dental_portal.patient_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.patient_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.patient_charges
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);

ALTER TABLE dental_portal.patient_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_portal.patient_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_portal_backend_access
  ON dental_portal.patient_payments
  FOR ALL TO dental_portal_backend
  USING (true) WITH CHECK (true);
