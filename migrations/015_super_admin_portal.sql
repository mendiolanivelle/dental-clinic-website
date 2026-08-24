ALTER TABLE dental_portal.staff_profiles
  DROP CONSTRAINT staff_profiles_role_check;

UPDATE dental_portal.staff_profiles
SET role = 'super_admin'
WHERE role = 'admin';

ALTER TABLE dental_portal.staff_profiles
  ADD CONSTRAINT staff_profiles_role_check
    CHECK (role IN ('receptionist', 'dentist', 'super_admin')),
  ADD COLUMN password_salt text,
  ADD COLUMN password_hash text,
  ADD COLUMN last_login_at timestamptz,
  ADD CONSTRAINT staff_profiles_password_pair_check CHECK (
    (password_salt IS NULL AND password_hash IS NULL)
    OR
    (password_salt IS NOT NULL AND password_hash IS NOT NULL)
  );

GRANT INSERT (
  auth_user_id, email, display_name, normalized_name, role, active,
  dentist_id, password_salt, password_hash
) ON dental_portal.staff_profiles TO dental_portal_backend;

GRANT UPDATE (
  active, password_salt, password_hash, last_login_at, updated_at
) ON dental_portal.staff_profiles TO dental_portal_backend;

GRANT INSERT (display_name, specialty, active)
  ON dental_portal.dentists TO dental_portal_backend;

GRANT UPDATE (active)
  ON dental_portal.dentists TO dental_portal_backend;
