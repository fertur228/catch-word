-- Движок v2, Э5: семантическая карта словаря (pgvector).
--
-- Эмбеддинги живут в ОТДЕЛЬНОЙ таблице, не колонкой в word_cards: клиентский
-- pullCards делает select('*') (cloud-sync.ts:100) — колонка на сотни float
-- гоняла бы мегабайты в браузер на каждый вход. Join — только внутри RPC.
--
-- Провайдер v1 — встроенная в Supabase Edge модель gte-small (384 измерения,
-- без внешних ключей). При появлении GOOGLE_API_KEY функция embed-cards
-- переключится на gemini-embedding; пересчёт — тем же джобом (truncate таблицы).
--
-- Заполняет таблицу ПОСТОЯННЫЙ джоб embed-cards (pg_cron каждые 10 минут,
-- добирает строки без эмбеддинга) — НЕ recognize: он карточек не создаёт,
-- их создаёт клиент позже через pushCard.

create extension if not exists vector;

create table public.card_embeddings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  card_id    text not null,
  word       text not null,
  provider   text not null default 'gte-small',
  embedding  vector(384) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- HNSW по косинусному расстоянию (запросы «ближайшие соседи в СВОЕЙ коллекции»).
create index card_embeddings_hnsw_idx
  on public.card_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.card_embeddings enable row level security;
-- Политик нет: пишет embed-cards (service_role), читают RPC (security definer).

-- Ближайшие соседи карточки в коллекции ТЕКУЩЕГО пользователя.
-- БЕЗ параметра пользователя: внутри жёстко auth.uid() (иначе IDOR — подставив
-- чужой id, читаешь чужую коллекцию).
create or replace function public.nearest_cards(p_card text, k integer default 6)
returns table (card_id text, word text, distance real)
language sql
security definer
set search_path = public
as $$
  select n.card_id, n.word, (n.embedding <=> q.embedding)::real as distance
  from card_embeddings q
  join card_embeddings n
    on n.user_id = q.user_id and n.card_id <> q.card_id
  where q.user_id = auth.uid() and q.card_id = p_card
  order by n.embedding <=> q.embedding
  limit greatest(1, least(k, 12));
$$;

revoke all on function public.nearest_cards(text, integer) from public;
revoke all on function public.nearest_cards(text, integer) from anon;
grant execute on function public.nearest_cards(text, integer) to authenticated;
grant execute on function public.nearest_cards(text, integer) to service_role;

-- Карточки без эмбеддинга (для джоба embed-cards). Anti-join, только service_role.
create or replace function public.pending_embeddings(p_limit integer default 150)
returns table (user_id uuid, card_id text, word text)
language sql
security definer
set search_path = public
as $$
  select w.user_id, w.id, w.word
  from word_cards w
  left join card_embeddings e on e.user_id = w.user_id and e.card_id = w.id
  where e.card_id is null and coalesce(w.word, '') <> ''
  limit greatest(1, least(p_limit, 300));
$$;

revoke all on function public.pending_embeddings(integer) from public;
revoke all on function public.pending_embeddings(integer) from anon;
revoke all on function public.pending_embeddings(integer) from authenticated;
grant execute on function public.pending_embeddings(integer) to service_role;

-- Постоянный джоб: каждые 10 минут добираем недостающие эмбеддинги.
-- Тот же секрет, что у quest-agent (Vault: quest_agent_secret).
select cron.schedule(
  'embed-cards-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://fkkloiiyzplpljlsyhyy.supabase.co/functions/v1/embed-cards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'quest_agent_secret'
      )
    ),
    body    := jsonb_build_object('batch', 16)
  );
  $$
);
