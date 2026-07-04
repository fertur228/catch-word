# Деплой веб-версии TakeWord (Cloudflare Pages + Supabase)

Веб — это тот же Expo-проект, собранный для браузера (`expo export -p web` →
статический `dist/`). Бэкенд — тот же Supabase (auth, Postgres `word_cards`,
Storage `stickers`, edge-функция `recognize`). Ничего на Cloudflare переносить
из Supabase не нужно.

## 1. Локальная проверка прод-сборки

```bash
npx expo export -p web      # соберёт в ./dist
npx serve dist              # или: npx http-server dist
```

Открой http://localhost:3000 — должны работать `/welcome`, вход, онбординг,
съёмка/загрузка фото → распознавание → сохранение, Коллекция, Повторение.

## 2. Cloudflare Pages

1. Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → репозиторий
   `fertur228/catch-word`.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** `npx expo export -p web`
   - **Build output directory:** `dist`
3. **Environment variables** (Production и Preview):
   - `EXPO_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = `<anon-public-key>`
   - `NODE_VERSION` = `20`
   > Только `EXPO_PUBLIC_*` попадают в браузер. Секреты (RECOGNIZE_API_KEY и т.п.)
   > сюда НЕ добавляем — они живут в секретах edge-функции Supabase.
4. SPA-фолбэк и кэш/security уже заданы файлами `public/_redirects` и
   `public/_headers` (Expo копирует `public/` в `dist/`).
5. Deploy. Получишь адрес вида `https://catch-word.pages.dev`.

## 3. Supabase — разрешить редиректы веба

Dashboard → **Authentication → URL Configuration**:
- **Site URL:** `https://<custom-domain>` (или `https://catch-word.pages.dev`)
- **Redirect URLs** (добавить все):
  - `http://localhost:8081/auth-callback`
  - `https://catch-word.pages.dev/auth-callback`
  - `https://<custom-domain>/auth-callback`

Без этого Google-вход на вебе вернёт ошибку redirect.

## 4. Google OAuth

Провайдер Google уже включён в Supabase (используется мобилкой). Для веба
дополнительно ничего в Google Cloud менять обычно не нужно — редирект идёт на
домен Supabase. Если consent-screen требует домены — добавь домен сайта и ссылки
`/(marketing)/privacy`, `/(marketing)/terms`.

## 5. Кастомный домен

Cloudflare Pages → **Custom domains** → добавить (напр. `app.catchword.app`),
DNS подхватится автоматически (домен на Cloudflare). После этого добавь
`https://app.catchword.app/auth-callback` в Supabase Redirect URLs (п. 3).

## 6. Обновления

Каждый push в `main` → Cloudflare автоматически пересобирает и публикует.
Тот же код собирается и в мобильное приложение — проверяй обе платформы:
`npx expo start --web` и `npx expo start` (Expo Go / dev-client).
