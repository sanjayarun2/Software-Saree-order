-- Adds logo_zoom column for user-controlled zoom in/out on the PDF logo.
-- Range 0.5–2.0, default 1.0 (no zoom). ADD-ONLY: does not alter other columns.

ALTER TABLE public.pdf_settings
  ADD COLUMN IF NOT EXISTS logo_zoom NUMERIC NOT NULL DEFAULT 1.0
  CHECK (logo_zoom >= 0.5 AND logo_zoom <= 2.0);
