-- Instant when order was marked despatched (IST display uses this; despatch_date stays calendar day).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS despatched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.despatched_at IS
  'Timestamp when order was marked DESPATCHED (full instant). despatch_date remains the calendar day for filters.';
