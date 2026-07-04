// Supabase Edge Function: /revenuecat-webhook
// ─────────────────────────────────────────────────────────────────────────
// Принимает вебхуки RevenueCat (Apple IAP на iOS) и пишет статус подписки в
// public.subscriptions — ту же таблицу, что и Polar-вебхук (web). Её читают
// useSubscription (клиент) и consume_scan (серверный лимит сканов).
//
// Аутентификация — СОБСТВЕННЫМ секретом (заголовок Authorization, задаётся в
// дашборде RevenueCat и в секрете функции REVENUECAT_WEBHOOK_AUTH), НЕ Supabase-JWT.
// Поэтому деплой с verify_jwt=false (см. config.toml).
//
// App User ID в событии = Supabase user.id (мы задаём его через Purchases.logIn).
// Анонимные RC-события ($RCAnonymousID:…) пропускаем — их не к чему привязать.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

type SubStatus = 'trialing' | 'active' | 'canceled' | 'past_due' | 'revoked';

/** Тип события RevenueCat + период → наш статус подписки. null = событие игнорируем. */
function statusFor(type: string, periodType: string): SubStatus | null {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'NON_RENEWING_PURCHASE':
      return periodType === 'TRIAL' ? 'trialing' : 'active';
    case 'CANCELLATION':
      // Автопродление выключено, но доступ есть до конца оплаченного периода.
      return 'canceled';
    case 'BILLING_ISSUE':
      return 'past_due';
    case 'EXPIRATION':
      return 'revoked';
    default:
      // SUBSCRIBER_ALIAS / TRANSFER / TEST и прочее — не трогаем подписку.
      return null;
  }
}

/** Тариф из product_id (…monthly / …yearly). */
function planFor(productId: string): string | null {
  const p = productId.toLowerCase();
  if (p.includes('year') || p.includes('annual')) return 'yearly';
  if (p.includes('month')) return 'monthly';
  if (p.includes('week')) return 'weekly';
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'server_misconfigured' }, 500);
  }
  // Проверка собственного секрета (RevenueCat шлёт его в Authorization).
  if (!WEBHOOK_AUTH || req.headers.get('Authorization') !== WEBHOOK_AUTH) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { event?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const event = body.event ?? {};
  const type = String(event.type ?? '');
  const appUserId = String(event.app_user_id ?? '');
  const periodType = String(event.period_type ?? '');
  const productId = String(event.product_id ?? '');

  // Анонимные покупки не к чему привязать — тихо принимаем (RC не должен ретраить).
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    return json({ ok: true, skipped: 'anonymous' });
  }

  const status = statusFor(type, periodType);
  if (!status) return json({ ok: true, skipped: type });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // email в таблице NOT NULL — берём из auth.users (best-effort).
  let email = '';
  try {
    const { data } = await admin.auth.admin.getUserById(appUserId);
    email = data.user?.email ?? '';
  } catch {
    // не критично — оставляем пустым
  }

  const periodEndMs = Number(event.expiration_at_ms ?? 0);
  const currentPeriodEnd = periodEndMs > 0 ? new Date(periodEndMs).toISOString() : null;

  // Одна RC-строка на пользователя (upsert по rc_app_user_id). Polar-строки не
  // трогаем (у них rc_app_user_id = NULL). useSubscription/consume_scan берут
  // последнюю по created_at.
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: appUserId,
      email,
      status,
      plan: planFor(productId),
      current_period_end: currentPeriodEnd,
      store: 'revenuecat',
      rc_app_user_id: appUserId,
      rc_product_id: productId || null,
      cancelled_at: type === 'CANCELLATION' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'rc_app_user_id' },
  );

  if (error) {
    console.error('[revenuecat-webhook] upsert:', error.message);
    return json({ error: 'db_error', message: error.message }, 500);
  }

  return json({ ok: true, status });
});
