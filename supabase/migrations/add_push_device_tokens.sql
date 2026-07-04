-- FCM device tokens for Velo app push notifications (industry-standard when app is closed).

CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  device_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_device_tokens_platform_check
    CHECK (platform IN ('android', 'ios', 'web')),
  CONSTRAINT push_device_tokens_token_len_check
    CHECK (char_length(token) >= 10 AND char_length(token) <= 4096)
);

CREATE UNIQUE INDEX IF NOT EXISTS push_device_tokens_user_token_idx
  ON public.push_device_tokens (user_id, token);

CREATE INDEX IF NOT EXISTS push_device_tokens_user_id_idx
  ON public.push_device_tokens (user_id);

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_device_tokens'
      AND policyname = 'Users can view own push_device_tokens'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can view own push_device_tokens"
      ON public.push_device_tokens
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id)$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_device_tokens'
      AND policyname = 'Users can insert own push_device_tokens'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can insert own push_device_tokens"
      ON public.push_device_tokens
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id)$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_device_tokens'
      AND policyname = 'Users can update own push_device_tokens'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can update own push_device_tokens"
      ON public.push_device_tokens
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_device_tokens'
      AND policyname = 'Users can delete own push_device_tokens'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can delete own push_device_tokens"
      ON public.push_device_tokens
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id)$p$;
  END IF;
END;
$rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_device_tokens TO authenticated;
