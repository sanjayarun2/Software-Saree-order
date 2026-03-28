-- Workers under an admin: DB enforces max_devices=1 while listed; max_devices=2 when removed.
-- Visible in Supabase: Table Editor → admin_workers (admin_user_id + worker_email).

CREATE TABLE IF NOT EXISTS public.admin_workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_workers_worker_email_unique
  ON public.admin_workers (lower(trim(worker_email)));

CREATE INDEX IF NOT EXISTS admin_workers_admin_user_id_idx ON public.admin_workers(admin_user_id);

ALTER TABLE public.admin_workers ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_workers' AND policyname = 'Admins manage own worker rows') THEN
    EXECUTE $p$CREATE POLICY "Admins manage own worker rows" ON public.admin_workers
      FOR ALL USING (auth.uid() = admin_user_id) WITH CHECK (auth.uid() = admin_user_id)$p$;
  END IF;
END;
$rls$;

CREATE OR REPLACE FUNCTION public.admin_workers_normalize_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.worker_email := lower(trim(NEW.worker_email));
  IF NEW.worker_email = '' THEN
    RAISE EXCEPTION 'worker_email required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_workers_normalize_bi ON public.admin_workers;
CREATE TRIGGER admin_workers_normalize_bi
  BEFORE INSERT OR UPDATE OF worker_email ON public.admin_workers
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_workers_normalize_email();

CREATE OR REPLACE FUNCTION public.apply_worker_strict_for_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE wid uuid;
BEGIN
  SELECT id INTO wid FROM auth.users WHERE lower(trim(email)) = lower(trim(target_email)) LIMIT 1;
  IF wid IS NULL THEN RETURN;
  END IF;
  UPDATE public.user_profiles SET max_devices = 1 WHERE user_id = wid;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_worker_default_for_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE wid uuid;
BEGIN
  SELECT id INTO wid FROM auth.users WHERE lower(trim(email)) = lower(trim(target_email)) LIMIT 1;
  IF wid IS NULL THEN RETURN;
  END IF;
  UPDATE public.user_profiles SET max_devices = 2 WHERE user_id = wid;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_admin_workers_max_devices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_worker_strict_for_email(NEW.worker_email);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.release_worker_default_for_email(OLD.worker_email);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND (OLD.worker_email IS DISTINCT FROM NEW.worker_email) THEN
    PERFORM public.release_worker_default_for_email(OLD.worker_email);
    PERFORM public.apply_worker_strict_for_email(NEW.worker_email);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS admin_workers_max_devices_trigger ON public.admin_workers;
CREATE TRIGGER admin_workers_max_devices_trigger
  AFTER INSERT OR DELETE OR UPDATE OF worker_email ON public.admin_workers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_admin_workers_max_devices();

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
      NEW.raw_user_meta_data->>'mobile_number',
      NEW.raw_user_meta_data->>'phone'
    ),
    NEW.email,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    mobile = COALESCE(EXCLUDED.mobile, user_profiles.mobile),
    email = COALESCE(EXCLUDED.email, user_profiles.email),
    updated_at = now();

  IF EXISTS (
    SELECT 1 FROM public.admin_workers
    WHERE lower(trim(worker_email)) = lower(trim(NEW.email))
  ) THEN
    UPDATE public.user_profiles SET max_devices = 1 WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
