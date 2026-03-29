-- Unique 2-letter product code prefix per user (product code generation)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS product_code_prefix TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_product_code_prefix_unique
  ON public.user_profiles (product_code_prefix)
  WHERE product_code_prefix IS NOT NULL;
