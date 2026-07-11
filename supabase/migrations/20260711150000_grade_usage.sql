-- Серверный предохранитель для ИИ-оценки открытых ответов (движок v2, Э2).
--
-- consume_grade — единственная защита от абьюза grade-answer (клиентский
-- FREE_TEST_LIMIT — это UX, он сбрасывается чисткой localStorage). Кап общий
-- для free и premium: 50 проверок/день на юзера — щедро для человека,
-- бессмысленно для абьюзера ($0.03/день максимум).
--
-- Грабля scan-gating (повторяем осознанно): execute — ТОЛЬКО service_role
-- (функцию зовёт edge-функция grade-answer своим admin-клиентом), у
-- anon/authenticated отзываем явно.

create table public.grade_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  used    integer not null default 0,
  primary key (user_id, day)
);

alter table public.grade_usage enable row level security;
-- Политик нет намеренно: к таблице ходит только consume_grade (security definer).

create or replace function public.consume_grade(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant integer := 50;  -- проверок в день на юзера
  v_day   date := (now() at time zone 'utc')::date;
  v_used  integer;
begin
  insert into grade_usage (user_id, day, used)
  values (p_user, v_day, 1)
  on conflict (user_id, day) do update
    set used = grade_usage.used + 1
    where grade_usage.used < v_limit
  returning used into v_used;

  if v_used is null then
    -- условный UPDATE не сработал → лимит исчерпан
    select used into v_used from grade_usage where user_id = p_user and day = v_day;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_used, v_limit), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_grade(uuid) from public;
revoke all on function public.consume_grade(uuid) from anon;
revoke all on function public.consume_grade(uuid) from authenticated;
grant execute on function public.consume_grade(uuid) to service_role;
