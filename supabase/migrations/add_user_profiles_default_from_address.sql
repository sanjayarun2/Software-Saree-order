-- Shop FROM address per login account (user_id / email on user_profiles)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_from_address TEXT;

COMMENT ON COLUMN public.user_profiles.default_from_address IS
  'Default FROM/sender address for labels; scoped to this user account.';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_default_from_address_len'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_default_from_address_len
      CHECK (default_from_address IS NULL OR char_length(default_from_address) <= 800);
  END IF;
END $$;
