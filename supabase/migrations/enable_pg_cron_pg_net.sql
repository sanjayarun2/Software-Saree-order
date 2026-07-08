-- Required for scheduled poll-velo-order-push (server-side API poll).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
