-- Snapshot of website order line items (name, qty, image URL) for packing view in Velo app.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS website_line_items JSONB;

CREATE INDEX IF NOT EXISTS orders_website_line_items_present_idx
  ON public.orders (user_id)
  WHERE website_line_items IS NOT NULL AND jsonb_array_length(website_line_items) > 0;
