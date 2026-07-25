-- Remember website orders the user deleted so sync does not re-import them.
CREATE TABLE IF NOT EXISTS public.deleted_website_orders (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_order_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, external_order_id)
);

ALTER TABLE public.deleted_website_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deleted_website_orders'
      AND policyname = 'Users manage own deleted_website_orders'
  ) THEN
    CREATE POLICY "Users manage own deleted_website_orders"
      ON public.deleted_website_orders
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS deleted_website_orders_user_id_idx
  ON public.deleted_website_orders (user_id);
