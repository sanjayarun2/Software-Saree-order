-- Website order payment state: paid vs unpaid (manual orders stay NULL).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IS NULL OR payment_status IN ('paid', 'unpaid'));
  END IF;
END;
$chk$;

CREATE INDEX IF NOT EXISTS orders_user_payment_status_idx
  ON public.orders (user_id, payment_status)
  WHERE payment_status IS NOT NULL;
