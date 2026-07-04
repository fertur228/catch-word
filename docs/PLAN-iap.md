# План: реальная оплата на iOS (Apple IAP через RevenueCat)

> Обновлено: 2026-07-03. Закрывает блокеры App Store: **2.1** (подписка-заглушка),
> **3.1.1** (нельзя внешняя оплата за цифру на iOS), **3.1.2** (корректная цена +
> restore), неработающий «Восстановить покупки».

## Решение
iOS — **Apple IAP через RevenueCat** (обёртка над StoreKit: валидация чеков,
entitlements, вебхуки, кросс-платформа). Web остаётся на **Polar**. Обе оплаты
пишут премиум в **одну** таблицу `public.subscriptions` — её уже читают и
`useSubscription` (клиент), и `consume_scan` (серверный лимит сканов).

## Архитектура (как покупка → премиум)
```
iOS-покупка ──> RevenueCat SDK ──> Apple IAP (StoreKit)
   App User ID = Supabase user.id   (как Polar reference_id — единый аккаунт)
        │
        ├── (1) МГНОВЕННО: RevenueCat entitlement "premium" на устройстве
        │        → useSubscription на нативе сразу видит премиум (без ожидания сети)
        │
        └── (2) НАДЁЖНО: RevenueCat webhook → edge-функция revenuecat-webhook
                 → upsert public.subscriptions (status/plan/period_end) по user_id
                 → сервер (consume_scan) и другие устройства видят премиум
```
Ключевое: `Purchases.logIn(supabaseUserId)` привязывает покупку Apple к тому же
аккаунту, что и веб-Polar. Так подписка едина на всех устройствах и платформах.

## Что делаешь ТЫ (внешние настройки, код от них не зависит)

### 0. Предусловие — БЕЗ этого IAP не работает вообще
App Store Connect → **Agreements, Tax, and Banking** → принять **Paid Apps**
agreement, заполнить банк и налоги. Пока «Paid Apps» не Active — IAP не грузятся.

### 1. App Store Connect — продукты подписки
- Создать **Subscription Group** (напр. «TakeWord Premium»).
- 2 auto-renewable подписки (product ID → цена) — РЕШЕНО 2026-07-03: 2 тарифа:
  - `com.almazbukayev.takeword.premium.monthly` — $6.99 / месяц
  - `com.almazbukayev.takeword.premium.yearly` — $39.99 / год + **Introductory
    Offer: 7 дней бесплатно** (Free trial)
- Для каждого: локализация (назв./описание), скрин для ревью.

### 2. RevenueCat (dashboard)
- Проект → добавить iOS-приложение (bundle id `com.almazbukayev.takeword`).
- App Store Connect **API key** (или App-Specific Shared Secret) — для валидации чеков.
- **Entitlement** `premium`.
- **Products** (3 шт., те же product ID из ASC) → привязать к entitlement `premium`.
- **Offering** `default` с 3 пакетами (weekly / monthly / annual).
- Скопировать **публичный iOS SDK-ключ** → в `.env` как `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
- **Webhook**: URL = `<SUPABASE_URL>/functions/v1/revenuecat-webhook`, задать
  Authorization-секрет → его же положить в секреты edge-функции.

## Что делаю Я (код)

### Клиент
- `react-native-purchases` (+ Expo config-plugin), `pod install`, ребилд.
- Инициализация `Purchases.configure({ apiKey })` при старте (только iOS).
- На входе/выходе: `Purchases.logIn(session.user.id)` / `Purchases.logOut()`.
- `src/lib/iap.ts` (натив) + `src/lib/iap.web.ts` (web-заглушка): `getOfferings`,
  `purchasePackage`, `restorePurchases`, `isPremiumFromRC()`.
- `paywall-screen.tsx`: заменить заглушку-alert на **реальную покупку**; цены,
  период и «7 дней бесплатно» брать **из offering RevenueCat**, а не хардкодить —
  это требование 3.1.2 (списываемая сумма должна быть точной и заметной). Кнопка
  «Восстановить покупки» → `restorePurchases`.
- `settings-screen.tsx`: «Восстановить покупки» — реальный restore. «Управление
  подпиской» уже ведёт на системный экран Apple — ок.
- `useSubscription`: на нативе `isPremium = RC-entitlement активен ИЛИ Supabase-строка
  активна` (RC даёт мгновенный премиум сразу после покупки, Supabase — источник
  правды и кросс-девайс).

### Сервер
- `supabase/functions/revenuecat-webhook/index.ts`: проверка Authorization-заголовка,
  парс события RevenueCat (INITIAL_PURCHASE / RENEWAL / CANCELLATION / EXPIRATION /
  ...), `upsert` в `public.subscriptions` по `app_user_id`(=user_id). Деплой с
  `verify_jwt=false` (аутентификация своим секретом, как у polar-webhook).
- Миграция: добавить в `subscriptions` nullable-колонки под RevenueCat
  (`store text`, `rc_entitlement_id text`, `rc_product_id text`) — Polar-поля
  остаются. `consume_scan` НЕ трогаем (он читает `status` — работает для обоих).

## Тестирование
- **StoreKit Configuration file** (`.storekit`) — локальный тест покупок прямо в
  симуляторе, без реального App Store (быстрый цикл разработки).
- **Sandbox-тестер** (ASC → Users → Sandbox) — end-to-end на реальном устройстве.

## Порядок
Мой код и твои настройки (ASC + RevenueCat) можно делать **параллельно**. Для
ЖИВОГО теста нужны продукты в ASC + ключи RevenueCat. Я могу начать с кода на
StoreKit-конфиге (покупки эмулируются локально), потом подключим реальные ключи.

## Готчи / на что заложиться
- **2.1**: продукты IAP надо сабмитить ВМЕСТЕ с билдом (в «Ready to Submit»), иначе
  ревьюер не протестирует покупку → отказ. В review notes — демо-аккаунт.
- **3.1.1**: на iOS не должно быть ссылок на веб-оплату (Polar). Polar уже
  web-only (guard по `Platform.OS`); проверить, что маркетинг-роут/pricing
  недостижим из iOS-бинарника.
- **3.1.2**: на экране покупки — название, срок, цена (из стора), рабочие ссылки
  Terms + Privacy (уже есть), кнопка Restore.
- **Аккаунт-маппинг** (это ломали раньше — см. память): App User ID RevenueCat =
  Supabase UUID = Polar reference_id. Единый ключ на всех платформах.
- Уже премиум с веба (Polar)? Пейволл проверяет `isPremium` и не предлагает покупку.

## Открытые решения (подтвердить до старта)
1. Оставляем **3 тарифа** (нед/мес/год) или упрощаем до **2** (мес/год)? Меньше
   продуктов = проще и быстрее ревью, меньше поддержки.
2. «7 дней бесплатно» — только на **годовом** (как в текущем пейволле)?
3. Схема product ID `com.almazbukayev.takeword.premium.{weekly,monthly,yearly}` — ок?
