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

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_booking_date_idx ON public.orders(booking_date);
CREATE INDEX IF NOT EXISTS orders_despatch_date_idx ON public.orders(despatch_date);
