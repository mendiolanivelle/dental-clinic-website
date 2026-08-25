CREATE POLICY dental_portal_backend_insert
  ON dental_portal.staff_profiles
  FOR INSERT TO dental_portal_backend
  WITH CHECK (true);

CREATE POLICY dental_portal_backend_update
  ON dental_portal.staff_profiles
  FOR UPDATE TO dental_portal_backend
  USING (true) WITH CHECK (true);
