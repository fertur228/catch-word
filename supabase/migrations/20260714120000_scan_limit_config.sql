-- Лимиты сканов → конфиг (фидбэк тестеров 14.07: нужен A/B «5/день vs 20 total»
-- без миграций и редеплоя). Поведение ПО УМОЛЧАНИЮ не меняется: free 5/день,
-- premium fair-use 100/день, lifetime-квота выключена.
--
-- app_config.scan_limits:
--   free_daily    int|null — дневной free-лимит (null = дневного капа нет);
--   free_total    int|null — lifetime-квота free-сканов (null = выключена);
--   premium_daily int      — fair-use кап премиума.
-- Включить «20 total»: update app_config
--   set value = '{"free_daily": null, "free_total": 20, "premium_daily": 100}'
--   where key = 'scan_limits';

create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- Конфиг читают все (клиент показывает остаток лимита), пишет только
-- service_role (политику на запись не создаём — RLS её запрещает).
drop policy if exists "config readable by all" on public.app_config;
create policy "config readable by all"
  on public.app_config for select
  using (true);

insert into public.app_config (key, value)
  values ('scan_limits', '{"free_daily": 5, "free_total": null, "premium_daily": 100}'::jsonb)
  on conflict (key) do nothing;

-- Lifetime-счётчик сканов (для режима free_total): дневной used сбрасывается
-- каждый день, used_total — никогда (кроме refund при ошибке распознавания).
alter table public.scan_usage add column if not exists used_total int not null default 0;

create or replace function public.consume_scan(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg         jsonb;
  v_free_daily  int;
  v_free_total  int;
  v_prem_daily  int;
  v_daily_limit int;
  v_total_limit int;
  v_used        int;
  v_used_total  int;
  v_status      text;
  v_period      timestamptz;
  v_premium     boolean;
begin
  -- Конфиг лимитов; нет строки → прежние зашитые дефолты (5/день, 100/день).
  select value into v_cfg from public.app_config where key = 'scan_limits';
  if v_cfg is null then
    v_free_daily := 5;
    v_free_total := null;
    v_prem_daily := 100;
  else
    v_free_daily := (v_cfg->>'free_daily')::int;
    v_free_total := (v_cfg->>'free_total')::int;
    v_prem_daily := coalesce((v_cfg->>'premium_daily')::int, 100);
  end if;
  -- Страховка от кривого конфига: free совсем без капов = бесплатный безлимит,
  -- такого режима нет — откатываемся к 5/день.
  if v_free_daily is null and v_free_total is null then
    v_free_daily := 5;
  end if;

  select s.status, s.current_period_end
    into v_status, v_period
  from public.subscriptions s
  where s.user_id = p_user
  order by s.created_at desc
  limit 1;

  -- coalesce: у юзера без строки подписки v_status = null, и «in» дал бы null —
  -- CASE это переживает, но в JSON-ответ утекали premium/unlimited = null.
  v_premium := coalesce(
    v_status in ('active', 'trialing')
      or (v_status = 'canceled' and v_period is not null and v_period > now()),
    false);

  v_daily_limit := case when v_premium then v_prem_daily else v_free_daily end;
  v_total_limit := case when v_premium then null else v_free_total end;

  insert into public.scan_usage (user_id, used) values (p_user, 0)
    on conflict (user_id) do nothing;

  update public.scan_usage
    set used = 0
    where user_id = p_user and updated_at::date < current_date;

  -- Атомарный инкремент, только если проходят ОБА включённых капа.
  update public.scan_usage
    set used = used + 1, used_total = used_total + 1, updated_at = now()
    where user_id = p_user
      and (v_daily_limit is null or used < v_daily_limit)
      and (v_total_limit is null or used_total < v_total_limit)
    returning used, used_total into v_used, v_used_total;

  if v_used is null then
    select used, used_total into v_used, v_used_total
    from public.scan_usage where user_id = p_user;
    return jsonb_build_object(
      'allowed', false, 'unlimited', v_premium, 'premium', v_premium,
      'used', coalesce(v_used, 0),
      'limit', coalesce(v_daily_limit, v_total_limit),
      'used_total', coalesce(v_used_total, 0), 'limit_total', v_total_limit,
      -- total → квота выжжена навсегда (клиент может показать другой текст).
      'reason', case
        when v_total_limit is not null and coalesce(v_used_total, 0) >= v_total_limit then 'total'
        else 'daily'
      end);
  end if;

  return jsonb_build_object(
    'allowed', true, 'unlimited', v_premium, 'premium', v_premium,
    'used', v_used, 'limit', coalesce(v_daily_limit, v_total_limit),
    'used_total', v_used_total, 'limit_total', v_total_limit);
end;
$$;

-- Refund возвращает скан в ОБА счётчика (ошибка модели не сжигает квоту).
create or replace function public.refund_scan(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scan_usage
    set used = greatest(0, used - 1),
        used_total = greatest(0, used_total - 1),
        updated_at = now()
    where user_id = p_user;
end;
$$;

-- Как и раньше: только service_role (см. готчу в 20260701120000_scan_usage.sql).
revoke all on function public.consume_scan(uuid) from public, anon, authenticated;
revoke all on function public.refund_scan(uuid)  from public, anon, authenticated;
grant execute on function public.consume_scan(uuid) to service_role;
grant execute on function public.refund_scan(uuid)  to service_role;
