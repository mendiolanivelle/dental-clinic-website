CREATE UNIQUE INDEX appointments_patient_slot_active_idx
  ON dental_portal.appointments (patient_id, starts_at)
  WHERE status IN ('scheduled', 'confirmed');

ALTER TABLE dental_portal.follow_up_recommendations
  ADD COLUMN appointment_id uuid UNIQUE REFERENCES dental_portal.appointments(id);

DO $$
DECLARE
  follow_up record;
  available_start timestamptz;
  created_appointment_id uuid;
BEGIN
  FOR follow_up IN
    SELECT *
    FROM dental_portal.follow_up_recommendations
    WHERE status = 'pending' AND appointment_type_id IS NOT NULL
    ORDER BY recommended_on, created_at
  LOOP
    SELECT slot
    INTO available_start
    FROM generate_series(
      ((follow_up.recommended_on + time '09:00') AT TIME ZONE 'Asia/Manila'),
      ((follow_up.recommended_on + time '16:00') AT TIME ZONE 'Asia/Manila'),
      interval '1 hour'
    ) slot
    WHERE slot > now()
      AND EXTRACT(ISODOW FROM follow_up.recommended_on) BETWEEN 1 AND 6
      AND NOT EXISTS (
        SELECT 1 FROM dental_portal.appointments appointment
        WHERE (appointment.dentist_id = follow_up.dentist_id OR appointment.patient_id = follow_up.patient_id)
          AND appointment.status IN ('scheduled', 'confirmed')
          AND appointment.starts_at < slot + interval '1 hour'
          AND appointment.ends_at > slot
      )
      AND NOT EXISTS (
        SELECT 1 FROM dental_portal.appointment_requests request
        WHERE (request.dentist_id = follow_up.dentist_id OR request.patient_id = follow_up.patient_id)
          AND request.status IN ('requested', 'confirmed')
          AND request.requested_start_at < slot + interval '1 hour'
          AND request.requested_end_at > slot
      )
    ORDER BY slot
    LIMIT 1;

    IF available_start IS NOT NULL THEN
      INSERT INTO dental_portal.appointments (
        patient_id, dentist_id, appointment_type_id, starts_at, ends_at,
        status, patient_instructions, created_at, updated_at
      ) VALUES (
        follow_up.patient_id, follow_up.dentist_id, follow_up.appointment_type_id,
        available_start, available_start + interval '1 hour', 'confirmed',
        follow_up.notes, now(), now()
      )
      RETURNING id INTO created_appointment_id;

      UPDATE dental_portal.follow_up_recommendations
      SET status = 'scheduled', appointment_id = created_appointment_id, updated_at = now()
      WHERE id = follow_up.id;
    END IF;
  END LOOP;
END
$$;
