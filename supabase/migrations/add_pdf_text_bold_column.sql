-- Add text_bold to pdf_settings for center custom text (bold vs normal).
ALTER TABLE public.pdf_settings
  ADD COLUMN IF NOT EXISTS text_bold BOOLEAN NOT NULL DEFAULT true;
