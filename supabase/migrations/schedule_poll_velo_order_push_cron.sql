-- Schedule server-side Velo API poll every 2 minutes (push when app is closed).
-- Requires: pg_cron, pg_net, vault secret `velo_push_webhook_secret` (same as VELO_PUSH_WEBHOOK_SECRET).

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'poll-velo-order-push-every-2-min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'poll-velo-order-push-every-2-min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rzwbpjjayarptlwjfpzm.supabase.co/functions/v1/poll-velo-order-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-velo-push-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'velo_push_webhook_secret'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $$
);
