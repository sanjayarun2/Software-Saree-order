-- Per-user Chatwoot connection for the in-app Messages inbox.
-- Chatwoot runs on a shared self-hosted server; each shop uses its own
-- Chatwoot account id + access token so their WhatsApp / Instagram /
-- Facebook conversations stay isolated.
CREATE TABLE IF NOT EXISTS public.chatwoot_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  base_url TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL DEFAULT '',
  inbox_id TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chatwoot_settings_base_url_len_check
    CHECK (char_length(base_url) <= 512),
  CONSTRAINT chatwoot_settings_access_token_len_check
    CHECK (char_length(access_token) <= 2048),
  CONSTRAINT chatwoot_settings_account_id_len_check
    CHECK (char_length(account_id) <= 64),
  CONSTRAINT chatwoot_settings_inbox_id_len_check
    CHECK (char_length(inbox_id) <= 64)
);

ALTER TABLE public.chatwoot_settings ENABLE ROW LEVEL SECURITY;

DO $rls$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatwoot_settings'
      AND policyname = 'Users manage own chatwoot_settings'
  ) THEN
    CREATE POLICY "Users manage own chatwoot_settings"
      ON public.chatwoot_settings
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatwoot_settings TO authenticated;
