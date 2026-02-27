-- ADD-ONLY: toggle for normalizing WhatsApp-style addresses when generating PDFs.
-- Does not alter or drop any existing columns.

ALTER TABLE public.pdf_settings
  ADD COLUMN IF NOT EXISTS normalize_addresses BOOLEAN NOT NULL DEFAULT FALSE;

