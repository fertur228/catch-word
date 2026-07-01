-- Серверный лимит бесплатных сканов (антифрод).
-- Раньше лимит жил только на клиенте (in-memory счётчик, сбрасывался рефрешем) —
-- тривиально обходился. Теперь authoritative-проверка идёт в edge-функции
-- `recognize` через SECURITY DEFINER RPC ниже (только service_role).

create table if not exists public.scan_usage (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  used       int         not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.scan_usage enable row level security;

-- Пользователь видит только свой счётчик (для отображения остатка в UI).
-- Запись — только через RPC ниже (клиент напрямую писать НЕ может).
drop policy if exists "read own scan usage" on public.scan_usage;
create policy "read own scan usage"
  on public.scan_usage for select
  using (auth.uid() = user_id);

-- Атомарно списать один бесплатный скан.
--   premium → безлимит (used не трогаем);
--   free    → инкремент, если ещё под лимитом; иначе allowed=false.
-- Лимит (10) ДОЛЖЕН совпадать с FREE_SCAN_LIMIT в src/lib/collection-context.tsx.
create or replace function public.consume_scan(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   int := 10;
  v_used    int;
  v_status  text;
  v_period  timestamptz;
  v_premium boolean;
begin
  -- Последняя подписка пользователя — та же логика, что useSubscription() на клиенте.
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

  -- Гарантируем строку, затем атомарно инкрементим только если под лимитом.
  insert into public.scan_usage (user_id, used) values (p_user, 0)
    on conflict (user_id) do nothing;

  update public.scan_usage
    set used = used + 1, updated_at = now()
    where user_id = p_user and used < v_limit
    returning used into v_used;

  if v_used is null then
    -- Лимит исчерпан (инкремент не прошёл).
    select used into v_used from public.scan_usage where user_id = p_user;
    return jsonb_build_object('allowed', false, 'unlimited', false,
                              'used', coalesce(v_used, v_limit), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'unlimited', false, 'used', v_used, 'limit', v_limit);
end;
$$;

-- Вернуть один скан (распознавание не удалось — не «сжигаем» скан на ошибке).
create or replace function public.refund_scan(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scan_usage
    set used = greatest(0, used - 1), updated_at = now()
    where user_id = p_user;
end;
$$;

-- Эти функции вызывает ТОЛЬКО edge-функция (service_role), НЕ клиент — иначе любой
-- с anon-ключом мог бы сам себе «вернуть»/накрутить сканы. ВАЖНО: Supabase по
-- default-privileges грантит execute ролям anon/authenticated ОТДЕЛЬНО от public,
-- поэтому отзываем явно у всех трёх, а не только у public.
revoke all on function public.consume_scan(uuid) from public, anon, authenticated;
revoke all on function public.refund_scan(uuid)  from public, anon, authenticated;
grant execute on function public.consume_scan(uuid) to service_role;
grant execute on function public.refund_scan(uuid)  to service_role;
