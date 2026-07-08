-- Server-side dedupe for FCM push (webhook + scheduled API poll).

CREATE TABLE IF NOT EXISTS public.push_notified_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_order_id TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_notified_orders_external_id_len
    CHECK (char_length(trim(external_order_id)) >= 1 AND char_length(external_order_id) <= 128)
);

CREATE UNIQUE INDEX IF NOT EXISTS push_notified_orders_user_external_idx
  ON public.push_notified_orders (user_id, external_order_id);

CREATE INDEX IF NOT EXISTS push_notified_orders_notified_at_idx
  ON public.push_notified_orders (notified_at DESC);

ALTER TABLE public.push_notified_orders ENABLE ROW LEVEL SECURITY;

-- No client policies: only service role (edge functions) reads/writes this table.

GRANT SELECT, INSERT, DELETE ON TABLE public.push_notified_orders TO service_role;

ALTER TABLE public.api_integrations
  ADD COLUMN IF NOT EXISTS last_push_poll_at TIMESTAMPTZ;
