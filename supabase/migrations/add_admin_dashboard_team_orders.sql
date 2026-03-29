-- Dashboard: admins aggregate stats over their own orders plus listed workers' orders.
-- RPC resolves worker emails to auth user ids; RLS allows SELECT on those orders.

CREATE OR REPLACE FUNCTION public.admin_team_order_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[auth.uid()]::uuid[])
  FROM (
    SELECT auth.uid() AS uid
    UNION ALL
    SELECT worker_u.id
    FROM public.admin_workers aw
    INNER JOIN auth.users worker_u ON lower(trim(worker_u.email::text)) = aw.worker_email
    WHERE aw.admin_user_id = auth.uid()
  ) t;
$$;

REVOKE ALL ON FUNCTION public.admin_team_order_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_team_order_user_ids() TO authenticated;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Admins can view team worker orders'
  ) THEN
    EXECUTE $p$CREATE POLICY "Admins can view team worker orders" ON public.orders
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.admin_workers aw
          INNER JOIN auth.users worker_u ON lower(trim(worker_u.email::text)) = aw.worker_email
          WHERE aw.admin_user_id = auth.uid()
            AND orders.user_id = worker_u.id
        )
      )$p$;
  END IF;
END;
$rls$;
