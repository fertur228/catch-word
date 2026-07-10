-- Автономный агент-тренер (quest-agent).
--
-- Ночной pg_cron будит edge-функцию quest-agent, та для каждого активного
-- пользователя (≥1 карточка) прогоняет агентный цикл (LLM с инструментами)
-- и пишет персональный квест дня. Клиент при открытии делает SELECT из
-- daily_quests; если строки нет — фолбэк на статический пул (getDailyQuests).
--
-- Секрет вызова НЕ хранится в этой миграции: он лежит в Vault под именем
-- 'quest_agent_secret' (создаётся отдельно, см. docs/SETUP-quest-agent.md)
-- и совпадает с секретом функции QUEST_AGENT_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Квест дня, результат работы агента ─────────────────────────────────
-- quests: DailyQuest[] в том же контракте, что src/lib/daily-quest.ts
--         ({word, emoji, translation, category, ipa, dayIndex}).
-- day_index: UTC-сутки, Math.floor(Date.now()/86400000) — как todayIndex().
create table public.daily_quests (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  day_index     integer     not null,
  quests        jsonb       not null,
  coach_message text,
  difficulty    text,
  run_id        bigint,
  created_at    timestamptz not null default now(),
  primary key (user_id, day_index)
);

-- ── Трейс каждого прогона агента (observability, как LangSmith traces) ──
-- steps: [{tool, args, result_summary}] — полный след рассуждений.
create table public.agent_runs (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null,
  day_index   integer     not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  steps       jsonb       not null default '[]'::jsonb,
  outcome     text,       -- ok | error | guard_rejected
  model       text,
  tokens_in   integer     not null default 0,
  tokens_out  integer     not null default 0,
  cost_usd    numeric(10, 6) not null default 0
);
create index agent_runs_user_day on public.agent_runs (user_id, day_index);

-- ── Аудит мутаций агента (право двигать due_at) ────────────────────────
-- Каждое изменение содержит old/new: любое действие агента можно откатить
-- одним UPDATE по этой таблице.
create table public.agent_actions (
  id         bigint generated always as identity primary key,
  run_id     bigint not null references public.agent_runs(id) on delete cascade,
  user_id    uuid   not null,
  action     text   not null,            -- reschedule_cards | ...
  card_id    text,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);
create index agent_actions_run on public.agent_actions (run_id);

-- ── Доступы: явно, как в scan_usage (готча: revoke у anon/authenticated) ──
alter table public.daily_quests  enable row level security;
alter table public.agent_runs    enable row level security;
alter table public.agent_actions enable row level security;

revoke all on public.daily_quests  from anon, authenticated;
revoke all on public.agent_runs    from anon, authenticated;
revoke all on public.agent_actions from anon, authenticated;

-- Пользователь читает ТОЛЬКО свой квест. Пишет только service_role (функция).
grant select on public.daily_quests to authenticated;
create policy "read own daily quest"
  on public.daily_quests for select
  to authenticated
  using (auth.uid() = user_id);

-- agent_runs / agent_actions — только service_role (политик нет).

-- ── Ночное расписание ──────────────────────────────────────────────────
-- 22:00 UTC = 03:00 в Алматы (UTC+5): агент работает, пока когорта спит.
-- Квест пишется на СЛЕДУЮЩИЙ UTC-день (day_index+1): для Алматы он уже наступил.
--
-- FAN-OUT: по ОДНОМУ асинхронному запросу на юзера (pg_net шлёт параллельно).
-- Батч «все юзеры в одном запросе» падает с WORKER_RESOURCE_LIMIT — edge-воркер
-- не переживает ~10 последовательных LLM-циклов (проверено на проде 10.07.2026).
select cron.schedule(
  'quest-agent-nightly',
  '0 22 * * *',
  $$
  select net.http_post(
    url     := 'https://fkkloiiyzplpljlsyhyy.supabase.co/functions/v1/quest-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'quest_agent_secret'
      )
    ),
    body    := jsonb_build_object(
      'mode', 'user',
      'user_id', u.user_id::text,
      'day_index', (floor(extract(epoch from now()) * 1000 / 86400000))::int + 1
    ),
    timeout_milliseconds := 120000
  )
  from (select distinct user_id from public.word_cards) u;
  $$
);
