UPDATE dental_portal.staff_profiles
SET display_name = 'Dr. ' || regexp_replace(display_name, '^dr\.?\s+', '', 'i'),
    normalized_name = lower('Dr. ' || regexp_replace(display_name, '^dr\.?\s+', '', 'i')),
    updated_at = now()
WHERE role = 'dentist';

UPDATE dental_portal.dentists d
SET display_name = coalesce(
  (SELECT s.display_name FROM dental_portal.staff_profiles s
   WHERE s.dentist_id = d.id AND s.role = 'dentist' LIMIT 1),
  'Dr. ' || regexp_replace(d.display_name, '^dr\.?\s+', '', 'i')
);
