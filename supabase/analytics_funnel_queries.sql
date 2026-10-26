-- READ-ONLY queries for looking at your funnel. The SQL editor shows only the last result, so run one at a time.

-- 1. Onboarding: how many people reached each screen, in order
select props->>'id' as screen,
       min((props->>'step')::int) as step,
       count(distinct user_id) as people
from public.analytics_events
where name = 'onboarding_step_viewed'
group by 1
order by 2;

-- 2. From the paywall to a purchase
select name, count(distinct user_id) as people
from public.analytics_events
where name in ('pitch_viewed', 'plan_option_selected', 'purchase_started', 'purchase_succeeded',
               'purchase_failed', 'purchase_cancelled', 'purchase_pending', 'free_chosen')
group by name
order by people desc;

-- 3. What happened with the first hair analysis after paying
select props->>'outcome' as outcome, count(*) as times
from public.analytics_events
where name = 'analysis_result'
group by 1
order by 2 desc;

-- 4. How onboarding ended
select props->>'path' as path, count(distinct user_id) as people
from public.analytics_events
where name = 'onboarding_finished'
group by 1;

-- 5. Daily new people reaching the first question (last 30 days)
select date_trunc('day', created_at)::date as day, count(distinct user_id) as people
from public.analytics_events
where name = 'onboarding_step_viewed' and (props->>'step')::int = 1
  and created_at > now() - interval '30 days'
group by 1
order by 1;