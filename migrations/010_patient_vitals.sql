ALTER TABLE dental_portal.patients
  ADD COLUMN weight_kg numeric(5, 2),
  ADD COLUMN blood_pressure_systolic smallint,
  ADD COLUMN blood_pressure_diastolic smallint,
  ADD CONSTRAINT patients_weight_kg_check CHECK (
    weight_kg IS NULL OR weight_kg BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT patients_blood_pressure_check CHECK (
    (blood_pressure_systolic IS NULL AND blood_pressure_diastolic IS NULL)
    OR (
      blood_pressure_systolic BETWEEN 50 AND 300
      AND blood_pressure_diastolic BETWEEN 30 AND 200
      AND blood_pressure_systolic > blood_pressure_diastolic
    )
  );

GRANT UPDATE (
  display_name, normalized_name, phone_e164, age, gender,
  weight_kg, blood_pressure_systolic, blood_pressure_diastolic, updated_at
) ON dental_portal.patients TO dental_portal_backend;
