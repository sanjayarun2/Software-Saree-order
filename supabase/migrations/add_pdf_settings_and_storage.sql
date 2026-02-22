-- ADD-ONLY MIGRATION: Does not alter or drop any existing tables, buckets, or policies.
-- Only adds: new table pdf_settings, new bucket pdf-logos, new RLS policies for pdf-logos.
-- Existing data (orders, user_profiles, etc.) and their RLS are untouched.

-- PDF settings per user (content type, placement, text size, custom text, logo path in Storage)
CREATE TABLE IF NOT EXISTS public.pdf_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'logo' CHECK (content_type IN ('text', 'logo')),
  placement TEXT NOT NULL DEFAULT 'center' CHECK (placement IN ('left', 'center', 'right')),
  text_size INTEGER NOT NULL DEFAULT 15 CHECK (text_size >= 10 AND text_size <= 24),
  custom_text TEXT NOT NULL DEFAULT '',
  logo_path TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pdf_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pdf_settings" ON public.pdf_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pdf_settings" ON public.pdf_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pdf_settings" ON public.pdf_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pdf_settings" ON public.pdf_settings
  FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for PDF logos (private; access via RLS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-logos',
  'pdf-logos',
  false,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can only read/write their own folder {user_id}/*
CREATE POLICY "Users can upload own pdf logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'pdf-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own pdf logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'pdf-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own pdf logo"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'pdf-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own pdf logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'pdf-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
