# Ground truth для судьи (Э6): ручная разметка 10 прогонов

Зачем: «средняя оценка судьи 4.2/5» — самореферентная метрика, жюри разберёт её
одним вопросом («4.2 против чего?»). Ответ: «судья согласен с ручной разметкой
в N% случаев» — это сильнейший слайд. Разметка занимает ~2 часа, делается один
раз до демо (день 12–13).

## Как размечать

1. Взять 10 последних прогонов с оценками судьи:

```sql
select r.id, r.user_id, r.steps, e.scores as judge_scores
from agent_runs r join agent_evals e on e.run_id = r.id
order by r.id desc limit 10;
```

2. Для каждого прогона поставить СВОИ оценки 1–5 по той же рубрике, НЕ глядя
   на оценки судьи (сначала своя колонка, потом сравнение):
   - **personalization** — план опирается на данные именно этого ученика
     (телеметрия ошибок, просрочка), а не общий шаблон;
   - **variety** — цели/форматы не гоняются по кругу изо дня в день;
   - **feasibility** — цели — конкретные фотографируемые предметы;
   - **exercises_quality** — упражнения грамматичны и бьют в слабые места.

3. Записать в таблицу (создание — одной командой):

```sql
create table if not exists judge_ground_truth (
  run_id bigint primary key references agent_runs(id),
  scores jsonb not null,      -- {personalization, variety, feasibility, exercises_quality}
  noted_at timestamptz default now()
);
-- пример:
insert into judge_ground_truth values (52, '{"personalization":5,"variety":3,"feasibility":5,"exercises_quality":4}');
```

4. Процент согласия (совпадение ±1 балл по каждой оси — стандарт для 5-балльных рубрик):

```sql
select
  count(*) as runs,
  round(100.0 * avg(
    ( (abs((e.scores->>'personalization')::int - (g.scores->>'personalization')::int) <= 1)::int
    + (abs((e.scores->>'variety')::int           - (g.scores->>'variety')::int) <= 1)::int
    + (abs((e.scores->>'feasibility')::int       - (g.scores->>'feasibility')::int) <= 1)::int
    + (abs((e.scores->>'exercises_quality')::int - (g.scores->>'exercises_quality')::int) <= 1)::int
    ) / 4.0
  ), 1) as agreement_pct
from agent_evals e join judge_ground_truth g using (run_id);
```

Фраза для демо: «Судья согласен с ручной разметкой в {agreement_pct}% случаев
(N прогонов, допуск ±1 балл)».
