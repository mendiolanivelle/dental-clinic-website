ALTER TABLE dental_portal.prescriptions
  DROP CONSTRAINT prescriptions_image_byte_size_check,
  ADD CONSTRAINT prescriptions_image_byte_size_check CHECK (
    image_byte_size BETWEEN 1 AND 2097152
  ) NOT VALID;
