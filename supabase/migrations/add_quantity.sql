-- Add optional quantity column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity INTEGER;
