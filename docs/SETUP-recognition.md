# TakeWord — подключение распознавания (Gemini + Supabase)

> Обновлено: 2026-06-28. Цель — завести всё, чтобы серверная функция `/recognize` могла звать Gemini.
> Решение по архитектуре/модели — `PLAN-scan-cutout.md`. Это пошаговая настройка доступов.
> Карта/деньги и Docker НЕ нужны. Аккаунты пользователей и оплата — отложены.

## Что вообще нужно (3 вещи)
1. **Ключ Gemini** (Google AI Studio) — бесплатно, без карты. Хранится только на сервере.
2. **Проект Supabase** (аккаунт у тебя есть) — наш мини-бэкенд. Нужны его `URL` и `anon key`.
3. **Supabase CLI** на Mac — чтобы задеплоить функцию `/recognize`.

---

## Шаг 1 — Ключ Gemini (ты, в браузере, ~2 мин)
1. Открой **https://aistudio.google.com/apikey** (или aistudio.google.com → «Get API key»).
2. Войди под Google-аккаунтом.
3. **Create API key** → скопируй (выглядит как `AIza...`). Карта не нужна.
4. **Никуда не вставляй его в код.** Он пойдёт в секрет Supabase (Шаг 4) — и его лучше ввести самому, чтобы он не светился в чате.

## Шаг 2 — Проект Supabase (ты, в браузере, ~3 мин)
1. **https://supabase.com/dashboard**. Если проекта ещё нет — **New project**: имя `catchword`, регион поближе (напр. **Frankfurt / eu-central-1**), задай и **сохрани пароль БД**.
2. Возьми 3 значения:
   - **Project URL**: `https://<ref>.supabase.co` (Settings → API)
   - **anon public key** (Settings → API) — публичный, его можно класть в приложение и присылать мне.
   - **Reference ID** = `<ref>` (Settings → General, или из URL дашборда).

## Шаг 3 — Supabase CLI (терминал, ~3 мин)
> Деплоим в облако, **Docker не нужен**.
```bash
brew install supabase/tap/supabase     # установка CLI
supabase login                          # откроет браузер → подтвердить
# в этой сессии Claude можно набрать:  ! supabase login   (вывод попадёт в чат)

cd /Users/almazbukayev/TakeWord
supabase init                           # создаст папку supabase/ (Docker не требуется)
supabase link --project-ref <ref>       # связать с твоим проектом (может спросить пароль БД)
```

## Шаг 4 — Ключ Gemini в секрет (терминал, ~1 мин)
> Запусти **сам**, чтобы ключ не появлялся в чате.
```bash
supabase secrets set GEMINI_API_KEY=ВСТАВЬ_СВОЙ_КЛЮЧ
supabase secrets list                   # проверка: покажет имя GEMINI_API_KEY (без значения)
```

---

## Дальше — это уже моя часть (Фаза 1 из PLAN-scan-cutout.md)
- Напишу `supabase/functions/recognize/index.ts` — вызов **`gemini-2.5-flash-lite`** (OpenAI-совместимый, JSON-схема) + кеш + лимит сканов.
- Миграцию `supabase/migrations/0001_recognize.sql` (счётчик сканов).
- Деплой: `supabase functions deploy recognize`.
- В приложении пропишем `Project URL` + `anon key` (в env), и `src/lib/recognize.ts` будет звать функцию.

## Что прислать мне
- **Project URL** и **anon key** (можно прямо в чат — anon публичный).
- **Reference ID** (`<ref>`).
- Gemini-ключ **НЕ присылай** — просто положи в секрет сам (Шаг 4).

## Что НЕ нужно сейчас
Карта/деньги · Docker · аккаунты пользователей/Auth · RevenueCat/оплата.

## Подсказка
**Фаза 0** (чистый JS: проносим реальное фото через экраны) ключа и Supabase **не требует** — её можно делать параллельно, пока заводишь доступы.
