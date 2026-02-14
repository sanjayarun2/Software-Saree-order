-- Saree Order App - Supabase Schema
-- Run this in your Supabase SQL Editor

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

-- RLS Policies: Users can only access their own orders
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders" ON public.orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own orders" ON public.orders
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_booking_date_idx ON public.orders(booking_date);
CREATE INDEX IF NOT EXISTS orders_despatch_date_idx ON public.orders(despatch_date);
