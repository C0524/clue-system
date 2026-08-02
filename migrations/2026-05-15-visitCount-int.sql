-- Migration: convert visitCount to INT and normalize values
-- Run this against your MySQL database (backup first!)

START TRANSACTION;

-- If visitCount column does not exist, add it as INT
ALTER TABLE clues 
  ADD COLUMN IF NOT EXISTS visitCount INT NULL DEFAULT 0;

-- If visitCount exists but is not INT, attempt to convert existing string values to INT
-- Convert numeric strings to integers, non-numeric to 0
UPDATE clues
SET visitCount = CASE
  WHEN visitCount REGEXP '^[0-9]+$' THEN CAST(visitCount AS UNSIGNED)
  WHEN visitCount REGEXP '^[0-9]+\\.[0-9]+$' THEN CAST(visitCount AS UNSIGNED)
  ELSE 0
END
WHERE visitCount IS NOT NULL;

-- Ensure column type is INT
ALTER TABLE clues
  MODIFY COLUMN visitCount INT NULL DEFAULT 0;

COMMIT;

-- After running, verify with:
-- SELECT id, visitCount FROM clues LIMIT 20;