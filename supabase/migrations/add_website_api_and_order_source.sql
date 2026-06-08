-- Website order import (Velo API Settings)
-- Safe to re-run on existing Saree project: rzwbpjjayarptlwjfpzm
-- Adds: orders.order_source, orders.external_order_id, api_integrations table

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── orders: mark manual vs website + duplicate-safe external id ─────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source TEXT;

UPDATE public.orders
SET order_source = 'manual'
WHERE order_source IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_source SET DEFAULT 'manual';

ALTER TABLE public.orders
  ALTER COLUMN order_source SET NOT NULL;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_source_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_source_check
      CHECK (order_source IN ('manual', 'website'));
  END IF;
END;
$chk$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_order_id TEXT;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_external_order_id_len_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_external_order_id_len_check
      CHECK (external_order_id IS NULL OR char_length(external_order_id) <= 128);
  END IF;
END;
$chk$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_external_order_id_unique
  ON public.orders (user_id, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_user_order_source_idx
  ON public.orders (user_id, order_source);

-- ── api_integrations: store Velo website API key per user ───────────────────

CREATE TABLE IF NOT EXISTS public.api_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'velo_website',
  label TEXT NOT NULL DEFAULT 'Velo Website',
  api_key TEXT NOT NULL DEFAULT '',
  api_base_url TEXT NOT NULL DEFAULT 'https://sakthi-textiles-shop.vercel.app',
  last_since TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_integrations_provider_check
    CHECK (provider IN ('velo_website')),
  CONSTRAINT api_integrations_label_len_check
    CHECK (char_length(trim(label)) >= 1 AND char_length(label) <= 120),
  CONSTRAINT api_integrations_api_key_len_check
    CHECK (char_length(api_key) <= 512),
  CONSTRAINT api_integrations_api_base_url_len_check
    CHECK (char_length(api_base_url) >= 8 AND char_length(api_base_url) <= 512)
);

CREATE INDEX IF NOT EXISTS api_integrations_user_id_idx
  ON public.api_integrations (user_id);

CREATE INDEX IF NOT EXISTS api_integrations_user_enabled_idx
  ON public.api_integrations (user_id, enabled)
  WHERE enabled = TRUE;

ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'api_integrations'
      AND policyname = 'Users can view own api_integrations'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can view own api_integrations"
      ON public.api_integrations
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id)$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'api_integrations'
      AND policyname = 'Users can insert own api_integrations'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can insert own api_integrations"
      ON public.api_integrations
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id)$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'api_integrations'
      AND policyname = 'Users can update own api_integrations'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can update own api_integrations"
      ON public.api_integrations
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'api_integrations'
      AND policyname = 'Users can delete own api_integrations'
  ) THEN
    EXECUTE $p$CREATE POLICY "Users can delete own api_integrations"
      ON public.api_integrations
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id)$p$;
  END IF;
END;
$rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_integrations TO authenticated;
