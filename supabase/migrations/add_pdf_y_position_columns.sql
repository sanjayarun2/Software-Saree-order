-- Vertical positions in mm from section top (one section = 74.25mm). Used by live preview and PDF engine.
-- ADD-ONLY: does not alter other columns.

ALTER TABLE public.pdf_settings
  ADD COLUMN IF NOT EXISTS logo_y_mm NUMERIC DEFAULT 50 CHECK (logo_y_mm >= 0 AND logo_y_mm <= 74.25);

ALTER TABLE public.pdf_settings
  ADD COLUMN IF NOT EXISTS from_y_mm NUMERIC DEFAULT 27 CHECK (from_y_mm >= 0 AND from_y_mm <= 74.25);

ALTER TABLE public.pdf_settings
  ADD COLUMN IF NOT EXISTS to_y_mm NUMERIC DEFAULT 8 CHECK (to_y_mm >= 0 AND to_y_mm <= 74.25);
