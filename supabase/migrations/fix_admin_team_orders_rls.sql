-- Fix: The "Admins can view team worker orders" RLS policy on public.orders
-- uses a subquery on auth.users which the authenticated role cannot read
-- in newer Supabase versions. This causes ALL order SELECT queries to return 403.
--
-- The app already handles admin team reads via the RPC admin_team_order_user_ids()
-- (security definer, can access auth.users). The RLS policy is redundant and harmful.
--
-- This migration drops the broken policy and recreates it using the same RPC
-- so there is no subquery on auth.users at the RLS level.

DROP POLICY IF EXISTS "Admins can view team worker orders" ON public.orders;

CREATE POLICY "Admins can view team worker orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    user_id::text = ANY (public.admin_team_order_user_ids())
  );

-- Also fix the RPC to never return null entries:
DROP FUNCTION IF EXISTS public.admin_team_order_user_ids();

CREATE FUNCTION public.admin_team_order_user_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    array_remove(array_agg(distinct uid_txt), null),
    array[]::text[]
  )
  FROM (
    SELECT auth.uid()::text AS uid_txt
    WHERE auth.uid() IS NOT NULL

    UNION ALL

    SELECT worker_u.id::text AS uid_txt
    FROM public.admin_workers aw
    JOIN auth.users worker_u
      ON lower(trim(worker_u.email::text)) = aw.worker_email
    WHERE aw.admin_user_id = auth.uid()
      AND worker_u.id IS NOT NULL
  ) s;
$$;

REVOKE ALL ON FUNCTION public.admin_team_order_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_team_order_user_ids() TO authenticated;
