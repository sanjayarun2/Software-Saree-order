-- Per-shop WhatsApp Cloud inbox connection (Chatwoot-backed).
-- Meta business tokens stay in Chatwoot channel provider_config, not here.
CREATE TABLE IF NOT EXISTS public.whatsapp_channel_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL DEFAULT '',
  phone_number_id TEXT NOT NULL DEFAULT '',
  waba_id TEXT NOT NULL DEFAULT '',
  chatwoot_inbox_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'needs_reauth', 'disconnected')),
  connected_at TIMESTAMPTZ,
  last_health_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_channel_connections_phone_len_check
    CHECK (char_length(phone_number) <= 32),
  CONSTRAINT whatsapp_channel_connections_phone_id_len_check
    CHECK (char_length(phone_number_id) <= 64),
  CONSTRAINT whatsapp_channel_connections_waba_len_check
    CHECK (char_length(waba_id) <= 64),
  CONSTRAINT whatsapp_channel_connections_inbox_len_check
    CHECK (char_length(chatwoot_inbox_id) <= 64),
  CONSTRAINT whatsapp_channel_connections_error_len_check
    CHECK (char_length(last_error) <= 1024)
);

CREATE INDEX IF NOT EXISTS whatsapp_channel_connections_phone_number_id_idx
  ON public.whatsapp_channel_connections (phone_number_id)
  WHERE phone_number_id <> '';

ALTER TABLE public.whatsapp_channel_connections ENABLE ROW LEVEL SECURITY;

DO $rls$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_channel_connections'
      AND policyname = 'Users manage own whatsapp_channel_connections'
  ) THEN
    CREATE POLICY "Users manage own whatsapp_channel_connections"
      ON public.whatsapp_channel_connections
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_channel_connections TO authenticated;
