-- Фикс Т5 (12.07): nearest_cards смешивал КУРСЫ одного юзера — немецкому
-- «flasche» соседями приходили испанские «portátil»/«llave». Проект
-- мультикурсовый: дистракторы обязаны быть из пары языков исходной карточки
-- (та же находка Eng-ревью, что для review_events, — здесь была пропущена).
-- Пару берём join'ом через word_cards — новая колонка не нужна.

create or replace function public.nearest_cards(p_card text, k integer default 6)
returns table (card_id text, word text, distance real)
language sql
security definer
set search_path = public
as $$
  select n.card_id, n.word, (n.embedding <=> q.embedding)::real as distance
  from card_embeddings q
  join word_cards wq
    on wq.user_id = q.user_id and wq.id = q.card_id
  join card_embeddings n
    on n.user_id = q.user_id and n.card_id <> q.card_id
  join word_cards wn
    on wn.user_id = n.user_id and wn.id = n.card_id
   and wn.learning_lang = wq.learning_lang
   and wn.native_lang  = wq.native_lang
  where q.user_id = auth.uid() and q.card_id = p_card
  order by n.embedding <=> q.embedding
  limit greatest(1, least(k, 12));
$$;
