-- Fair-use кап для premium: «безлимит» → 100 сканов В ДЕНЬ (сброс на UTC-полночь).
-- Причина: при gemini-2.5-flash тяжёлый юзер на 200/день = ~$11.5/мес против ~$6
-- выручки. 100/день реальный ученик не замечает, но каждый юзер остаётся прибыльным.
-- Меняем ТОЛЬКО consume_scan: теперь premium тоже считается (та же таблица/сброс),
-- просто с лимитом 100 вместо 3. В ответ добавлен флаг `premium` — чтобы edge/клиент
-- отличали «premium исчерпал fair-use» (не показывать пейволл) от free-лимита.
-- free-лимит (3) синхронизирован с FREE_SCAN_LIMIT в src/lib/collection-context.tsx.

create or replace function public.consume_scan(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_limit int := 3;    -- free: 3/день
  v_prem_limit int := 100;  -- premium: fair-use 100/день
  v_limit   int;
  v_used    int;
  v_status  text;
  v_period  timestamptz;
  v_premium boolean;
begin
  -- Последняя подписка — та же логика, что useSubscription() на клиенте.
  select s.status, s.current_period_end
    into v_status, v_period
  from public.subscriptions s
  where s.user_id = p_user
  order by s.created_at desc
  limit 1;

  v_premium := v_status in ('active', 'trialing')
            or (v_status = 'canceled' and v_period is not null and v_period > now());

  v_limit := case when v_premium then v_prem_limit else v_free_limit end;

  -- Строка счётчика + дневной сброс (UTC) — теперь для ОБОИХ тарифов.
  insert into public.scan_usage (user_id, used) values (p_user, 0)
    on conflict (user_id) do nothing;

  update public.scan_usage
    set used = 0
    where user_id = p_user and updated_at::date < current_date;

  -- Атомарно инкрементим только под дневным лимитом.
  update public.scan_usage
    set used = used + 1, updated_at = now()
    where user_id = p_user and used < v_limit
    returning used into v_used;

  if v_used is null then
    -- Дневной лимит исчерпан (free = 3, premium = 100).
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
