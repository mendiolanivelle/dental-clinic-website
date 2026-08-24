ALTER TABLE dental_portal.staff_profiles
  ADD COLUMN normalized_name text;

UPDATE dental_portal.staff_profiles
SET normalized_name = lower(regexp_replace(trim(display_name), '\s+', ' ', 'g'));

ALTER TABLE dental_portal.staff_profiles
  ALTER COLUMN normalized_name SET NOT NULL,
  ADD CONSTRAINT staff_profiles_normalized_name_length_check
    CHECK (length(normalized_name) BETWEEN 2 AND 160);

CREATE UNIQUE INDEX staff_profiles_normalized_name_unique_idx
  ON dental_portal.staff_profiles (normalized_name);
