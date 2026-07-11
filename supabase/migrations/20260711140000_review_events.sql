-- Телеметрия ответов (движок v2, Э1 — docs/PLAN-engine-v2.md).
--
-- Каждый ответ пользователя в Повторении (флеш-карточки, тесты, открытые
-- ответы, тренировка от тренера) — строка здесь. На этих данных ночной
-- агент строит адаптивные тренировки (инструмент get_review_stats).
--
-- Схема данных:
--   ┌ клиент (telemetry.ts, батчи) ─► RPC log_review_events (кап) ─► таблица
--   └ агент (service_role) ────────► SELECT по паре языков ────────┘
--
-- Правила:
--  * Пара языков ОБЯЗАТЕЛЬНА: проект мультикурсовый, без неё статистика
--    смешивает курсы, а омографы разных пар неразличимы.
--  * INSERT только через RPC (политики insert нет): кап 1000 событий/сутки
--    на юзера — от бесконтрольной заливки строк.
--  * SELECT — только своё (RLS); агент ходит service_role'ом.

create table public.review_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  card_id       text,                    -- id из word_cards; null для целей вне коллекции
  word          text not null,           -- денормализовано: слово живёт, даже если карточку удалили
  day_index     integer not null,        -- день сессии (фиксируется на старте сессии, не на событии)
  learning_lang text not null,
  native_lang   text not null,
  source        text not null,           -- 'flashcards' | 'quiz' | 'workout'
  kind          text not null,           -- QuizKind | 'srs_rating'
  correct       boolean,                 -- null для флеш-карточек (там rating)
  rating        text,                    -- 'again' | 'good' | 'easy' — флеш-карточки и самооценка
  answer        text,                    -- текст ответа (открытые ответы), ≤500
  score         real,                    -- 0..1 от grade-answer (Э2); null = не оценивалось
  response_ms   integer,
  created_at    timestamptz not null default now()
);

create index review_events_user_created_idx
  on public.review_events (user_id, created_at desc);

alter table public.review_events enable row level security;

create policy "review_events: select own"
  on public.review_events for select
  using (auth.uid() = user_id);

-- Вставка — ТОЛЬКО через RPC с капом (политики insert намеренно нет).
create or replace function public.log_review_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_limit    constant integer := 1000;  -- кап событий на юзера в сутки
  v_today    integer;
  v_inserted integer := 0;
  e          jsonb;
begin
  if v_user is null then
    return 0; -- гость: молча ничего (клиент и не должен звать)
  end if;

  select count(*) into v_today
  from review_events
  where user_id = v_user and created_at > now() - interval '24 hours';

  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    exit when v_today + v_inserted >= v_limit;
    -- события без обязательных полей молча пропускаем (телеметрия не падает)
    continue when (e->>'word') is null or (e->>'kind') is null or (e->>'source') is null;
    insert into review_events
      (user_id, card_id, word, day_index, learning_lang, native_lang,
       source, kind, correct, rating, answer, score, response_ms)
    values
      (v_user,
       e->>'card_id',
       left(e->>'word', 100),
       coalesce((e->>'day_index')::integer, 0),
       coalesce(left(e->>'learning_lang', 12), 'en-US'),
       coalesce(left(e->>'native_lang', 12), 'ru-RU'),
       left(e->>'source', 20),
       left(e->>'kind', 30),
       (e->>'correct')::boolean,
       left(e->>'rating', 10),
       left(e->>'answer', 500),
       (e->>'score')::real,
       (e->>'response_ms')::integer);
    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;

-- Грабля scan-gating: права выдаём явно, anon отрезаем явно.
revoke all on function public.log_review_events(jsonb) from public;
revoke all on function public.log_review_events(jsonb) from anon;
grant execute on function public.log_review_events(jsonb) to authenticated;
grant execute on function public.log_review_events(jsonb) to service_role;
