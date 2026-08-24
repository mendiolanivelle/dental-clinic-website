CREATE OR REPLACE FUNCTION dental_portal.publish_checkout_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO dental_portal.clinical_records (
    patient_id, dentist_id, appointment_id, procedure_name,
    treated_on, patient_summary, published_at, created_at, updated_at
  )
  SELECT
    appointment.patient_id,
    appointment.dentist_id,
    appointment.id,
    NEW.description,
    (appointment.starts_at AT TIME ZONE 'Asia/Manila')::date,
    NEW.description || ' was completed during your visit. Follow the care instructions provided by your dentist and contact the clinic if you have questions.',
    NEW.created_at,
    NEW.created_at,
    NEW.created_at
  FROM dental_portal.appointments appointment
  WHERE appointment.id = NEW.appointment_id
    AND NOT EXISTS (
      SELECT 1
      FROM dental_portal.clinical_records record
      WHERE record.appointment_id = appointment.id
    );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION dental_portal.publish_checkout_record() FROM PUBLIC;

DROP TRIGGER IF EXISTS publish_checkout_record ON dental_portal.patient_charges;
CREATE TRIGGER publish_checkout_record
AFTER INSERT ON dental_portal.patient_charges
FOR EACH ROW EXECUTE FUNCTION dental_portal.publish_checkout_record();

INSERT INTO dental_portal.clinical_records (
  patient_id, dentist_id, appointment_id, procedure_name,
  treated_on, patient_summary, published_at, created_at, updated_at
)
SELECT
  appointment.patient_id,
  appointment.dentist_id,
  appointment.id,
  charge.description,
  (appointment.starts_at AT TIME ZONE 'Asia/Manila')::date,
  charge.description || ' was completed during your visit. Follow the care instructions provided by your dentist and contact the clinic if you have questions.',
  charge.created_at,
  charge.created_at,
  charge.created_at
FROM dental_portal.patient_charges charge
JOIN dental_portal.appointments appointment ON appointment.id = charge.appointment_id
WHERE NOT EXISTS (
  SELECT 1
  FROM dental_portal.clinical_records record
  WHERE record.appointment_id = appointment.id
);
