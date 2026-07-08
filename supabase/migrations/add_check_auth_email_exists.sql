-- Boolean lookup for login UX (wrong password vs unregistered email).
-- SECURITY DEFINER: reads auth.users; returns only true/false (no user data).
CREATE OR REPLACE FUNCTION public.check_auth_email_exists(lookup_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := lower(trim(lookup_email));
  IF normalized IS NULL OR normalized = '' THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = normalized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_email_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_auth_email_exists(TEXT) TO anon, authenticated;
