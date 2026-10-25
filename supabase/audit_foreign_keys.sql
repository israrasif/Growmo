-- supabase/audit_foreign_keys.sql
-- READ-ONLY. Shows which tables are linked to a user's login and what happens to them when the login is deleted.
-- delete_rule: CASCADE = rows are removed automatically. NO ACTION or RESTRICT = deleting the account would fail
-- unless the delete-account function clears the table first.
select
  c.conrelid::regclass as table_name,
  a.attname            as column_name,
  case c.confdeltype
    when 'c' then 'CASCADE'
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end                  as delete_rule
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
order by 1, 2;

-- Also tells you if the three tables the audit found are used by the app at all
select 'sessions' as table_name, count(*) as rows from public.sessions
union all select 'activities', count(*) from public.activities
union all select 'session_activities', count(*) from public.session_activities;