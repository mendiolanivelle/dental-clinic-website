UPDATE dental_portal.dentists d
SET active = false
WHERE NOT EXISTS (
  SELECT 1
  FROM dental_portal.staff_profiles s
  WHERE s.dentist_id = d.id
    AND s.role = 'dentist'
);
