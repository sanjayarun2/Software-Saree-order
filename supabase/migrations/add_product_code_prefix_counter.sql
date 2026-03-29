-- Central sequential counter for product_code_prefix (A0, A1, … A9, AA… AZ, B0… ZZ, A00…).
-- Clients call claim_next_product_prefix_index() then map the bigint to a string in app code.

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
