-- Align FROM/TO label Y so first address line starts at 14mm (label baseline 8mm) for all users.
-- Legacy FROM default was 27mm; TO was already 8mm.

UPDATE public.pdf_settings
SET from_y_mm = 8
WHERE from_y_mm = 27 OR from_y_mm IS NULL;

UPDATE public.pdf_settings
SET to_y_mm = 8
WHERE to_y_mm IS NULL;

ALTER TABLE public.pdf_settings
  ALTER COLUMN from_y_mm SET DEFAULT 8;

ALTER TABLE public.pdf_settings
  ALTER COLUMN to_y_mm SET DEFAULT 8;
