-- Per-user WhatsApp Cloud API settings for order confirmation templates.
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  access_token TEXT NOT NULL DEFAULT '',
  phone_number_id TEXT NOT NULL DEFAULT '',
  template_name TEXT NOT NULL DEFAULT '',
  template_language TEXT NOT NULL DEFAULT 'en',
  send_when TEXT NOT NULL DEFAULT 'create',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_settings_send_when_check
    CHECK (send_when IN ('create', 'despatch')),
  CONSTRAINT whatsapp_settings_access_token_len_check
    CHECK (char_length(access_token) <= 2048),
  CONSTRAINT whatsapp_settings_phone_number_id_len_check
    CHECK (char_length(phone_number_id) <= 64),
  CONSTRAINT whatsapp_settings_template_name_len_check
    CHECK (char_length(template_name) <= 120),
  CONSTRAINT whatsapp_settings_template_language_len_check
    CHECK (char_length(template_language) <= 16)
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

DO $rls$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_settings'
      AND policyname = 'Users manage own whatsapp_settings'
  ) THEN
    CREATE POLICY "Users manage own whatsapp_settings"
      ON public.whatsapp_settings
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $rls$;
