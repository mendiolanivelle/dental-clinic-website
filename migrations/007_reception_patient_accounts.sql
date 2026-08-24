ALTER TABLE dental_portal.patients
  ALTER COLUMN phone_e164 DROP NOT NULL,
  ALTER COLUMN phone_verified_at DROP NOT NULL;

GRANT INSERT ON dental_portal.patients TO dental_portal_backend;
