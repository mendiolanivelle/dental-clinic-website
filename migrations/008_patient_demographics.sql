ALTER TABLE dental_portal.patients
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_age_check'
      AND conrelid = 'dental_portal.patients'::regclass
  ) THEN
    ALTER TABLE dental_portal.patients
      ADD CONSTRAINT patients_age_check CHECK (age IS NULL OR age BETWEEN 0 AND 130);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_gender_check'
      AND conrelid = 'dental_portal.patients'::regclass
  ) THEN
    ALTER TABLE dental_portal.patients
      ADD CONSTRAINT patients_gender_check CHECK (
        gender IS NULL OR gender IN ('female', 'male', 'non_binary', 'prefer_not_to_say')
      );
  END IF;
END
$$;
