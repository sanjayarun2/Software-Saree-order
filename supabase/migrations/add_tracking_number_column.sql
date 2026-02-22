-- Add optional tracking / consignment / LR number to orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT DEFAULT NULL;
