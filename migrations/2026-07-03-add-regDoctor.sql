-- Add registration doctor (regDoctor) to support split between intent doctor and registration doctor.
ALTER TABLE clues ADD COLUMN regDoctor VARCHAR(100) NULL AFTER doctor;

-- Backfill existing rows: default regDoctor to doctor when regDoctor is empty.
UPDATE clues
SET regDoctor = doctor
WHERE (regDoctor IS NULL OR regDoctor = '')
  AND doctor IS NOT NULL
  AND doctor <> '';
