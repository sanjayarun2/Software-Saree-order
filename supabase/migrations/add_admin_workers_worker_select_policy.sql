-- Let listed workers detect their status (hide Admin UI) without seeing other admins' rows.
DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_workers' AND policyname = 'Workers read own listing row'
  ) THEN
    EXECUTE $p$CREATE POLICY "Workers read own listing row" ON public.admin_workers
      FOR SELECT TO authenticated
      USING (
        lower(trim(worker_email)) = lower(trim(coalesce((auth.jwt() ->> 'email')::text, '')))
      )$p$;
  END IF;
END;
$rls$;
