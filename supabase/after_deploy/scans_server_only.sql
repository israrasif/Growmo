-- Makes scans writable only by the server.
-- RUN THIS ONLY AFTER the new analyze-hair function is deployed and a test scan has worked.
-- The new function saves scans with the server's key. The old one saved them with the person's own login,
-- and would stop working once this is applied.

drop policy if exists "Users insert own scans" on public.scans;
revoke insert on public.scans from authenticated;
-- People can still read their own scans (the "Users read own scans" rule stays).