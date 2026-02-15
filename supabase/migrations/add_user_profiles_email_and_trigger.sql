-- Add email column to user_profiles (store email from auth.users)
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Trigger: insert/update user_profiles when a new auth user is created
-- Stores mobile from user_metadata and email from auth.users (bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, mobile, email, updated_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'mobile',
      NEW.raw_user_meta_data->>'mobile_number'
    ),
    NEW.email,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    mobile = COALESCE(EXCLUDED.mobile, user_profiles.mobile),
    email = COALESCE(EXCLUDED.email, user_profiles.email),
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
