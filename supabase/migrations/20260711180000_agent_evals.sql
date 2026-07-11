-- Движок v2, Э6: судья (evals), витрина без самообмана, ночной алерт, дайджест.

-- ── Оценки судьи ────────────────────────────────────────────────────────
create table public.agent_evals (
  run_id     bigint primary key references public.agent_runs(id) on delete cascade,
  scores     jsonb not null,   -- {personalization, variety, feasibility, exercises_quality}: 1–5
  verdict    text,             -- один абзац от судьи
  cost_usd   numeric(8,5),
  created_at timestamptz not null default now()
);
alter table public.agent_evals enable row level security;
revoke all on public.agent_evals from anon, authenticated;
-- только service_role (политик нет)

-- ── Витрина agent_health: метрики БЕЗ самообмана (урок «$54») ──────────
-- Свои/тестовые аккаунты не выдаются за пользователей: external_runs отдельно.
create view public.agent_health as
select
  (r.started_at at time zone 'utc')::date as day,
  count(*) as runs,
  count(*) filter (where r.outcome in ('ok', 'critic_fallback')) as ok_runs,
  count(*) filter (where r.outcome = 'critic_fallback') as critic_fallbacks,
  count(*) filter (
    where u.email not like '%@catch-words.com'
      and u.email not in (
        'fertur228@gmail.com', 'nodes.kazakhstan@gmail.com',
        'bukaevalmaz2005@icloud.com', 'alm@narxoz.kz'
      )
  ) as external_runs,
  round(avg((e.scores->>'personalization')::numeric), 2) as avg_personalization,
  round(avg((e.scores->>'variety')::numeric), 2)         as avg_variety,
  round(avg((e.scores->>'feasibility')::numeric), 2)     as avg_feasibility,
  round(avg((e.scores->>'exercises_quality')::numeric), 2) as avg_exercises,
  round(sum(r.cost_usd)::numeric, 4) as cost_usd
from public.agent_runs r
left join public.agent_evals e on e.run_id = r.id
join auth.users u on u.id = r.user_id
group by 1
order by 1 desc;

revoke all on public.agent_health from anon, authenticated;

-- ── Судья: 23:00 UTC, fan-out ПО ОДНОМУ run_id ─────────────────────────
-- Батч «все прогоны в одном вызове воркера» — это в точности пойманный
-- 10.07 WORKER_RESOURCE_LIMIT (миграция 20260710120000). Не повторяем.
select cron.schedule(
  'agent-eval-nightly',
  '0 23 * * *',
  $$
  select net.http_post(
    url     := 'https://fkkloiiyzplpljlsyhyy.supabase.co/functions/v1/agent-eval',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'quest_agent_secret'
      )
    ),
    body := jsonb_build_object('run_id', r.id)
  )
  from public.agent_runs r
  left join public.agent_evals e on e.run_id = r.id
  where r.started_at > now() - interval '24 hours'
    and r.finished_at is not null
    and e.run_id is null;
  $$
);

-- ── Ночной алерт 00:30 UTC (не «ручной SQL наутро») ────────────────────
-- Ночь без прогонов ИЛИ >30% ошибок → пуш на телефон через ntfy.sh.
-- Подписка: приложение ntfy (или браузер) → топик takeword-agent-fertur228.
select cron.schedule(
  'agent-alert-0030',
  '30 0 * * *',
  $$
  select net.http_post(
    url     := 'https://ntfy.sh',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'topic', 'takeword-agent-fertur228',
      'title', 'TakeWord: ночной агент не в порядке',
      'message', (
        select 'Прогонов за ночь: ' || count(*) ||
               ', ошибок: ' || count(*) filter (where outcome not in ('ok','critic_fallback'))
        from public.agent_runs where started_at > now() - interval '3 hours'
      )
    )
  )
  where (select count(*) from public.agent_runs where started_at > now() - interval '3 hours') = 0
     or (
       select (count(*) filter (where outcome not in ('ok','critic_fallback')))::float
              / greatest(count(*), 1)
       from public.agent_runs where started_at > now() - interval '3 hours'
     ) > 0.3;
  $$
);

-- ── Дайджест недели от тренера (решение основателя на гейте 11.07) ─────
create table public.coach_digests (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,   -- понедельник недели, которую подытоживаем
  digest     text not null,   -- ≤600 символов, родной язык
  stats      jsonb,           -- {answers, errors, top_words, ...} для карточки
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.coach_digests enable row level security;
revoke all on public.coach_digests from anon, authenticated;
grant select on public.coach_digests to authenticated;
create policy "read own digest"
  on public.coach_digests for select
  to authenticated
  using (auth.uid() = user_id);

-- Воскресенье 18:00 UTC, fan-out по юзерам с активностью за неделю.
select cron.schedule(
  'coach-digest-weekly',
  '0 18 * * 0',
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
    body := jsonb_build_object('mode', 'digest', 'user_id', t.user_id)
  )
  from (
    select distinct user_id from public.review_events
    where created_at > now() - interval '7 days'
  ) t;
  $$
);
