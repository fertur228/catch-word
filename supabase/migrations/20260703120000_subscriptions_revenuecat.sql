-- RevenueCat (Apple IAP на iOS) пишет в ту же таблицу public.subscriptions, что и
-- Polar (web). Добавляем провайдеро-нейтральные поля и уникальность RC-строки.

alter table public.subscriptions
  add column if not exists store          text,   -- 'revenuecat' | 'polar' | null
  add column if not exists rc_app_user_id text,   -- = user_id (App User ID в RevenueCat)
  add column if not exists rc_product_id  text;

-- Одна RC-строка на пользователя (для upsert по rc_app_user_id). Polar-строки
-- имеют rc_app_user_id = NULL — Postgres по умолчанию считает NULL-ы различными,
-- поэтому их может быть несколько; уникальность работает только для не-NULL.
create unique index if not exists subscriptions_rc_app_user_id_key
  on public.subscriptions(rc_app_user_id);

-- consume_scan/useSubscription НЕ меняем: они читают последнюю строку по created_at
-- и трактуют active/trialing/canceled(не истёкший) как премиум — для обоих провайдеров.
