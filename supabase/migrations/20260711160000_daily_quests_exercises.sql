-- Движок v2, Э3: агент собирает тренировку целиком.
--
-- exercises — jsonb-массив упражнений, которые ночной агент готовит вместе с
-- квестом: [{ "v":1, "word","kind","sentence"?,"distractors"?,"prompt"?,"why"? }].
-- Колонка аддитивна и обратно совместима: iOS-билд 6 её не читает, старые
-- строки остаются с NULL (клиент показывает обычные плитки режимов).
alter table public.daily_quests add column if not exists exercises jsonb;
