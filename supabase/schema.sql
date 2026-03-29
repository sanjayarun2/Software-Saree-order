-- Saree Order App - Supabase Schema
-- Safe to re-run on existing projects: tables/indexes use IF NOT EXISTS; policies are created only if missing (no DROP).

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_details TEXT NOT NULL CHECK (char_length(recipient_details) <= 600),
  sender_details TEXT NOT NULL CHECK (char_length(sender_details) <= 600),
  booked_by TEXT,
  booked_mobile_no TEXT,
  courier_name TEXT NOT NULL DEFAULT 'Professional',
  booking_date DATE NOT NULL,
  despatch_date DATE,
  quantity INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DESPATCHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own orders (skip if already present)
DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Users can view own orders') THEN
    EXECUTE $p$CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Users can insert own orders') THEN
    EXECUTE $p$CREATE POLICY "Users can insert own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Users can update own orders') THEN
    EXECUTE $p$CREATE POLICY "Users can update own orders" ON public.orders FOR UPDATE USING (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Users can delete own orders') THEN
    EXECUTE $p$CREATE POLICY "Users can delete own orders" ON public.orders FOR DELETE USING (auth.uid() = user_id)$p$;
  END IF;
END;
$rls$;

-- User profiles: mobile and email per user (login screen)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  mobile TEXT,
  email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'Users can view own profile') THEN
    EXECUTE $p$CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'Users can insert own profile') THEN
    EXECUTE $p$CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'Users can update own profile') THEN
    EXECUTE $p$CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id)$p$;
  END IF;
END;
$rls$;

CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON public.user_profiles(user_id);

-- Max devices per account (1–20). Default 2. Edit per user in Supabase: 1 = strict single device, 3+ = more on request.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 2
  CHECK (max_devices >= 1 AND max_devices <= 20);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS product_code_prefix TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_product_code_prefix_unique
  ON public.user_profiles (product_code_prefix)
  WHERE product_code_prefix IS NOT NULL;

-- Sequential assignment of product_code_prefix (see claim_next_product_prefix_index)
CREATE TABLE IF NOT EXISTS public.product_code_prefix_counter (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_index bigint NOT NULL DEFAULT -1
);

INSERT INTO public.product_code_prefix_counter (id, next_index)
VALUES (1, -1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_next_product_prefix_index()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v bigint;
BEGIN
  INSERT INTO public.product_code_prefix_counter (id, next_index)
  VALUES (1, -1)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.product_code_prefix_counter
  SET next_index = next_index + 1
  WHERE id = 1
  RETURNING next_index INTO STRICT v;

  RETURN v;
END;
$$;

REVOKE ALL ON TABLE public.product_code_prefix_counter FROM PUBLIC;
REVOKE ALL ON TABLE public.product_code_prefix_counter FROM authenticated;

REVOKE ALL ON FUNCTION public.claim_next_product_prefix_index() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_product_prefix_index() TO authenticated;

-- Registered devices (Settings + device login limit)
CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS user_devices_user_id_idx ON public.user_devices(user_id);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users can view own devices') THEN
    EXECUTE $p$CREATE POLICY "Users can view own devices" ON public.user_devices FOR SELECT USING (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users can insert own device') THEN
    EXECUTE $p$CREATE POLICY "Users can insert own device" ON public.user_devices FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users can update own devices') THEN
    EXECUTE $p$CREATE POLICY "Users can update own devices" ON public.user_devices FOR UPDATE USING (auth.uid() = user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users can delete own devices') THEN
    EXECUTE $p$CREATE POLICY "Users can delete own devices" ON public.user_devices FOR DELETE USING (auth.uid() = user_id)$p$;
  END IF;
END;
$rls$;

-- Admin workers: max_devices=1 while listed; default 2 when removed (see add_admin_workers.sql)
CREATE TABLE IF NOT EXISTS public.admin_workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_workers_worker_email_unique
  ON public.admin_workers (lower(trim(worker_email)));

CREATE INDEX IF NOT EXISTS admin_workers_admin_user_id_idx ON public.admin_workers(admin_user_id);

ALTER TABLE public.admin_workers ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_workers' AND policyname = 'Admins manage own worker rows') THEN
    EXECUTE $p$CREATE POLICY "Admins manage own worker rows" ON public.admin_workers
      FOR ALL USING (auth.uid() = admin_user_id) WITH CHECK (auth.uid() = admin_user_id)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_workers' AND policyname = 'Workers read own listing row') THEN
    EXECUTE $p$CREATE POLICY "Workers read own listing row" ON public.admin_workers
      FOR SELECT TO authenticated
      USING (
        lower(trim(worker_email)) = lower(trim(coalesce((auth.jwt() ->> 'email')::text, '')))
      )$p$;
  END IF;
END;
$rls$;

-- Admin dashboard: read workers' orders + RPC for team user ids (requires admin_workers above)
CREATE OR REPLACE FUNCTION public.admin_team_order_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[auth.uid()]::uuid[])
  FROM (
    SELECT auth.uid() AS uid
    UNION ALL
    SELECT worker_u.id
    FROM public.admin_workers aw
    INNER JOIN auth.users worker_u ON lower(trim(worker_u.email::text)) = aw.worker_email
    WHERE aw.admin_user_id = auth.uid()
  ) t;
$$;

REVOKE ALL ON FUNCTION public.admin_team_order_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_team_order_user_ids() TO authenticated;

DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Admins can view team worker orders') THEN
    EXECUTE $p$CREATE POLICY "Admins can view team worker orders" ON public.orders
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.admin_workers aw
          INNER JOIN auth.users worker_u ON lower(trim(worker_u.email::text)) = aw.worker_email
          WHERE aw.admin_user_id = auth.uid()
            AND orders.user_id = worker_u.id
        )
      )$p$;
  END IF;
END;
$rls$;

CREATE OR REPLACE FUNCTION public.admin_workers_normalize_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.worker_email := lower(trim(NEW.worker_email));
  IF NEW.worker_email = '' THEN
    RAISE EXCEPTION 'worker_email required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_workers_normalize_bi ON public.admin_workers;
CREATE TRIGGER admin_workers_normalize_bi
  BEFORE INSERT OR UPDATE OF worker_email ON public.admin_workers
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_workers_normalize_email();

CREATE OR REPLACE FUNCTION public.apply_worker_strict_for_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE wid uuid;
BEGIN
  SELECT id INTO wid FROM auth.users WHERE lower(trim(email)) = lower(trim(target_email)) LIMIT 1;
  IF wid IS NULL THEN RETURN;
  END IF;
  UPDATE public.user_profiles SET max_devices = 1 WHERE user_id = wid;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_worker_default_for_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE wid uuid;
BEGIN
  SELECT id INTO wid FROM auth.users WHERE lower(trim(email)) = lower(trim(target_email)) LIMIT 1;
  IF wid IS NULL THEN RETURN;
  END IF;
  UPDATE public.user_profiles SET max_devices = 2 WHERE user_id = wid;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_admin_workers_max_devices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_worker_strict_for_email(NEW.worker_email);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.release_worker_default_for_email(OLD.worker_email);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND (OLD.worker_email IS DISTINCT FROM NEW.worker_email) THEN
    PERFORM public.release_worker_default_for_email(OLD.worker_email);
    PERFORM public.apply_worker_strict_for_email(NEW.worker_email);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS admin_workers_max_devices_trigger ON public.admin_workers;
CREATE TRIGGER admin_workers_max_devices_trigger
  AFTER INSERT OR DELETE OR UPDATE OF worker_email ON public.admin_workers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_admin_workers_max_devices();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, mobile, email, updated_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'mobile',
      NEW.raw_user_meta_data->>'mobile_number',
      NEW.raw_user_meta_data->>'phone'
    ),
    NEW.email,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    mobile = COALESCE(EXCLUDED.mobile, user_profiles.mobile),
    email = COALESCE(EXCLUDED.email, user_profiles.email),
    updated_at = now();

  IF EXISTS (
    SELECT 1 FROM public.admin_workers
    WHERE lower(trim(worker_email)) = lower(trim(NEW.email))
  ) THEN
    UPDATE public.user_profiles SET max_devices = 1 WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_booking_date_idx ON public.orders(booking_date);
CREATE INDEX IF NOT EXISTS orders_despatch_date_idx ON public.orders(despatch_date);
