-- Таблица подписок Polar.
-- Заполняется только вебхуком (polar-webhook edge function, service role).
-- Пользователь читает только свою строку через RLS.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL,
  polar_subscription_id TEXT        UNIQUE,
  polar_customer_id     TEXT,
  -- trialing | active | canceled | past_due | revoked | free
  status                TEXT        NOT NULL DEFAULT 'free',
  -- weekly | monthly | yearly
  plan                  TEXT,
  current_period_end    TIMESTAMPTZ,
  trial_end             TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS subscriptions_polar_subscription_id_idx
  ON public.subscriptions(polar_subscription_id);

CREATE INDEX IF NOT EXISTS subscriptions_email_idx
  ON public.subscriptions(email);

-- RLS: пользователь видит только свою строку; запись — только service role.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user can read own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);
