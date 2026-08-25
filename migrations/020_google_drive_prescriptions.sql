ALTER TABLE dental_portal.prescriptions
  ADD COLUMN google_drive_file_id text,
  ALTER COLUMN image_bytes DROP NOT NULL,
  ADD CONSTRAINT prescriptions_storage_check CHECK (
    (image_bytes IS NULL) <> (google_drive_file_id IS NULL)
  ) NOT VALID;

CREATE UNIQUE INDEX prescriptions_google_drive_file_unique_idx
  ON dental_portal.prescriptions (google_drive_file_id)
  WHERE google_drive_file_id IS NOT NULL;
