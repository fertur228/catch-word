-- Free-лимит сканов 3 → 5 в день (решение основателя, план в памяти ещё с июля:
-- квест из 3 предметов съедал ВЕСЬ дневной лимит — на «просто поснимать»
-- ничего не оставалось). Premium fair-use (100/день) не меняется.
-- Синхронизировано с FREE_SCAN_LIMIT в src/lib/collection-context.tsx (тоже 5).
-- Примечание: iOS-билд 6 (на ревью) показывает в UI счётчик из старой константы
-- (3) — сервер разрешает 5, приложение просто недоиспользует лимит до апдейта.

create or replace function public.consume_scan(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_limit int := 5;    -- free: 5/день (было 3)
  v_prem_limit int := 100;  -- premium: fair-use 100/день
  v_limit   int;
  v_used    int;
  v_status  text;
  v_period  timestamptz;
  v_premium boolean;
begin
  select s.status, s.current_period_end
    into v_status, v_period
  from public.subscriptions s
  where s.user_id = p_user
  order by s.created_at desc
  limit 1;

  v_premium := v_status in ('active', 'trialing')
            or (v_status = 'canceled' and v_period is not null and v_period > now());

  v_limit := case when v_premium then v_prem_limit else v_free_limit end;

  insert into public.scan_usage (user_id, used) values (p_user, 0)
    on conflict (user_id) do nothing;

  update public.scan_usage
    set used = 0
    where user_id = p_user and updated_at::date < current_date;

  update public.scan_usage
    set used = used + 1, updated_at = now()
    where user_id = p_user and used < v_limit
    returning used into v_used;

  if v_used is null then
    select used into v_used from public.scan_usage where user_id = p_user;
    return jsonb_build_object('allowed', false, 'unlimited', v_premium, 'premium', v_premium,
                              'used', coalesce(v_used, v_limit), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'unlimited', v_premium, 'premium', v_premium,
                            'used', v_used, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_scan(uuid) from public, anon, authenticated;
grant execute on function public.consume_scan(uuid) to service_role;
