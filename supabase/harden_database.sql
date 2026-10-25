-- supabase/harden_database.sql
-- Written from the audit results of 25 Oct 2026. Safe to run more than once. It changes permissions only, never data.
-- Run it in the Supabase SQL editor, then run audit_security.sql again and send the results.

-- 1. Logged-out visitors (anon) never need table access: the whole app sits behind a login.
revoke all on all tables in schema public from anon;

-- 2. Signed-in users never need these powers. (Row rules do not protect against TRUNCATE, so remove it.)
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- 3. Tables people may only READ. Only the server (the webhook, edge functions, your dashboard) may write them.
revoke insert, update, delete on public.user_plans from authenticated;
revoke insert, update, delete on public.app_config from authenticated;
revoke insert, update, delete on public.research_papers from authenticated;

-- 4. Scans: people could delete their own scans through the API, and the monthly limit counts scans,
--    so deleting them would reset the limit. The app never deletes scans, so remove the power.
--    (Deleting an account still removes them: that runs on the server.)
drop policy if exists "Users delete own scans" on public.scans;
revoke delete on public.scans from authenticated;
-- Scans are never edited after they are saved, so remove that power too.
revoke update on public.scans from authenticated;

-- 5. Tables created in future start with the same locked-down defaults.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 6. Photo bucket: only pictures, and not enormous ones (15 MB). Stops someone filling your storage with other files.
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'hair-photos';

-- 7. The function that creates a free plan for each new user only needs to run as a trigger.
--    Nobody should be able to call it directly.
revoke execute on function public.handle_new_user_plan() from public, anon, authenticated;