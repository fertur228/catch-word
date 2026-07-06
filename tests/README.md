# Тесты веб-версии TakeWord

Два уровня проверок живой веб-версии (`catch-words.com`). Быстрый способ убедиться,
что тестеры видят рабочее приложение: регистрация, вход, пейволл, оплата, цены.

## Что где

| Файл | Что проверяет | Нужен браузер |
|---|---|---|
| `smoke/live-web.mjs` | Живой прод + конфиг: роуты 200, Polar-линк в бандле, цены = Polar API, лимит писем, redirect-URL, SMTP, шаблон кода, edge-функции живы | нет |
| `e2e/public.spec.ts` | Публичный путь: лендинг, форма входа, тарифы, юр-страницы, экран оплаты | да (Playwright) |
| `e2e/paywall.spec.ts` | Авторизованный путь: вход по email/паролю → пейволл → клик уводит на Polar с `reference_id` (тест самой монетизации) | да (Playwright) |
| `helpers/account.ts` | Идемпотентно создаёт тестовый аккаунт через Supabase admin | — |

## Запуск

```bash
# Быстрая проверка живого прода (секунды, без браузера) — гоняй хоть каждый деплой
npm run test:smoke

# Полный браузерный проход customer-пути (chromium + mobile Safari)
npm run test:e2e

# Интерактивный отладчик
npm run test:e2e:ui

# HTML-отчёт после прогона
npm run test:e2e:report

# Всё сразу
npm test
```

Первый запуск E2E требует браузеры: `npx playwright install chromium webkit`.

## Требования

- **`.env`** в корне с `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
  `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_ACCESS_TOKEN`.
  Без Management-токена smoke пропустит проверки конфига (не упадёт).
- Тестовый аккаунт (`e2e-web@catch-words.com`) создаётся **автоматически** в
  `beforeAll` — вручную ничего заводить не нужно. Пароль можно переопределить
  через `E2E_PASSWORD`.

## Нацелить на другой адрес

```bash
SMOKE_SITE=https://catch-word-web.pages.dev npm run test:smoke
BASE_URL=http://localhost:8081 npm run test:e2e     # против локальной веб-сборки
```

## Заметки

- **Smoke падает на «лимит писем ≥ 10/час»** — это НЕ баг теста: у Supabase стоит
  2 письма/час на весь проект, при массовом тесте регистрация встаёт. Порог поднять
  в Supabase → Auth → Rate Limits.
- **Гейт `_layout.tsx`:** авторизованному юзеру с `onboarded=true` гейт не делает
  редиректа с `/sign-in`, поэтому E2E ставит онбординг-флаг ПОСЛЕ входа (см. комментарий
  в `paywall.spec.ts`).
- **mobile-safari бывает flaky** на первом прогоне (webkit медленно грузит ~2.9 МБ
  RN-web бандл) — `retries` в `playwright.config.ts` это поглощает.
- E2E перехватывает переход на Polar и **не создаёт реальных платежей**.
