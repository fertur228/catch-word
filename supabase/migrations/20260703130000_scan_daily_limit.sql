-- Free-лимит сканов: было 10 навсегда → стало 3 В ДЕНЬ (сброс на UTC-полночь).
-- Меняем только consume_scan (та же таблица scan_usage: user_id, used, updated_at).
-- v_limit ДОЛЖЕН совпадать с FREE_SCAN_LIMIT в src/lib/collection-context.tsx.

create or replace function public.consume_scan(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   int := 3;   -- 3 бесплатных скана В ДЕНЬ
  v_used    int;
  v_status  text;
  v_period  timestamptz;
  v_premium boolean;
begin
  -- Последняя подписка (та же логика, что useSubscription на клиенте).
  select s.status, s.current_period_end
    into v_status, v_period
  from public.subscriptions s
  where s.user_id = p_user
  order by s.created_at desc
  limit 1;

  v_premium := v_status in ('active', 'trialing')
            or (v_status = 'canceled' and v_period is not null and v_period > now());

  if v_premium then
    return jsonb_build_object('allowed', true, 'unlimited', true, 'used', 0, 'limit', v_limit);
  end if;

  insert into public.scan_usage (user_id, used) values (p_user, 0)
    on conflict (user_id) do nothing;

  -- Дневной сброс: если последняя активность была не сегодня, обнуляем счётчик.
  -- (updated_at::date и current_date считаются в TZ сессии — в Supabase это UTC.)
  update public.scan_usage
    set used = 0
    where user_id = p_user and updated_at::date < current_date;

  -- Атомарно инкрементим только под дневным лимитом.
  update public.scan_usage
    set used = used + 1, updated_at = now()
    where user_id = p_user and used < v_limit
    returning used into v_used;

  if v_used is null then
    -- Дневной лимит исчерпан.
    select used into v_used from public.scan_usage where user_id = p_user;
    return jsonb_build_object('allowed', false, 'unlimited', false,
                              'used', coalesce(v_used, v_limit), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'unlimited', false, 'used', v_used, 'limit', v_limit);
end;
$$;

-- Гранты сохраняются при create or replace, но переустанавливаем явно (идемпотентно).
revoke all on function public.consume_scan(uuid) from public, anon, authenticated;
grant execute on function public.consume_scan(uuid) to service_role;
