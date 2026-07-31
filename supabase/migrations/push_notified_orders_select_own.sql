-- Allow each user to read their own push dedupe rows so the app can
-- seed local alert dedupe after background FCM (avoids re-alert on reopen).

GRANT SELECT ON TABLE public.push_notified_orders TO authenticated;

DROP POLICY IF EXISTS push_notified_orders_select_own ON public.push_notified_orders;
CREATE POLICY push_notified_orders_select_own
  ON public.push_notified_orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
