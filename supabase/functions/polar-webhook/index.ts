// Supabase Edge Function: /polar-webhook
// ─────────────────────────────────────────────────────────────────────────────
// Принимает вебхуки от Polar (polar.sh), верифицирует подпись по стандарту
// Standard Webhooks (HMAC-SHA256), обновляет таблицу `subscriptions`.
//
// Нужные секреты (supabase secrets set …):
//   POLAR_WEBHOOK_SECRET      — Signing Secret из Polar → Webhooks → эндпоинт
//   SUPABASE_URL              — Project URL (обычно уже есть в Edge Runtime)
//   SUPABASE_SERVICE_ROLE_KEY — service_role key (обычно уже есть в Edge Runtime)
//
// События, на которые подписываемся в Polar:
//   subscription.created / updated / active / canceled / uncanceled / revoked / past_due
//   order.refunded
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const POLAR_WEBHOOK_SECRET = Deno.env.get('POLAR_WEBHOOK_SECRET') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Standard Webhooks signature verification.
// Signed content: `{webhook-id}.{webhook-timestamp}.{raw-body}`
// Secret из Polar — уже base64-encoded, декодируем перед использованием.
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const msgId     = req.headers.get('webhook-id');
  const timestamp = req.headers.get('webhook-timestamp');
  const sigHeader = req.headers.get('webhook-signature');

  if (!msgId || !timestamp || !sigHeader) return false;

  // Защита от replay-атак: отклоняем запросы старше 5 минут.
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedContent = `${msgId}.${timestamp}.${rawBody}`;
  const secretBytes = Uint8Array.from(atob(POLAR_WEBHOOK_SECRET), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent),
  );
  const expected = `v1,${btoa(String.fromCharCode(...new Uint8Array(sigBytes)))}`;

  // Заголовок может содержать несколько подписей через пробел (ротация секретов).
  // Сравниваем за константное время, чтобы исключить timing-атаки.
  return sigHeader.split(' ').some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  });
}

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

// ── Обработчики событий ───────────────────────────────────────────────────────

async function handleSubscriptionEvent(
  admin: ReturnType<typeof createClient>,
  eventType: string,
  data: AnyRecord,
): Promise<void> {
  const subId      = data.id as string;
  const metadata   = (data.metadata ?? {}) as Record<string, string>;
  const userId     = metadata.reference_id ?? null;
  const email      = (data.customer?.email ?? '') as string;
  const customerId = (data.customer_id ?? data.customer?.id ?? '') as string;

  // Polar присылает status в поле data.status для большинства событий.
  // Для subscription.revoked принудительно ставим 'revoked' (на случай если
  // статус в payload ещё не обновился).
  const status: string = eventType === 'subscription.revoked'
    ? 'revoked'
    : (data.status as string) ?? 'active';

  const currentPeriodEnd = (data.current_period_end as string | null) ?? null;
  const trialEnd         = (data.trial_end as string | null) ?? null;
  const cancelledAt      = status === 'canceled'
    ? ((data.ended_at as string | null) ?? new Date().toISOString())
    : null;

  if (userId) {
    // Полный upsert — знаем пользователя через reference_id из checkout.
    const { error } = await admin.from('subscriptions').upsert(
      {
        user_id:               userId,
        email,
        polar_subscription_id: subId,
        polar_customer_id:     customerId,
        status,
        current_period_end:    currentPeriodEnd,
        trial_end:             trialEnd,
        cancelled_at:          cancelledAt,
        updated_at:            new Date().toISOString(),
      },
      { onConflict: 'polar_subscription_id' },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  } else {
    // reference_id отсутствует (edge case) — обновляем только статус по subId.
    const { error } = await admin
      .from('subscriptions')
      .update({
        status,
        current_period_end: currentPeriodEnd,
        trial_end:          trialEnd,
        cancelled_at:       cancelledAt,
        updated_at:         new Date().toISOString(),
      })
      .eq('polar_subscription_id', subId);
    if (error) throw new Error(`update failed: ${error.message}`);
    if (!subId) console.warn('subscription event missing both reference_id and id — skipped');
  }
}

async function handleOrderRefunded(
  admin: ReturnType<typeof createClient>,
  data: AnyRecord,
): Promise<void> {
  const subscriptionId = data.subscription_id as string | null;
  if (!subscriptionId) return; // единовременный заказ, не подписка

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('polar_subscription_id', subscriptionId);
  if (error) throw new Error(`order.refunded update failed: ${error.message}`);
}

// ── Точка входа ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!POLAR_WEBHOOK_SECRET) return json({ error: 'server_misconfigured' }, 500);

  const rawBody = await req.text();

  const valid = await verifySignature(req, rawBody);
  if (!valid) return json({ error: 'invalid_signature' }, 401);

  let event: { type: string; data: AnyRecord };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { type, data } = event;

  try {
    if (type.startsWith('subscription.')) {
      await handleSubscriptionEvent(admin, type, data);
    } else if (type === 'order.refunded') {
      await handleOrderRefunded(admin, data);
    }
    // Остальные события (checkout.*, customer.*, etc.) игнорируем — возвращаем 200.
  } catch (e) {
    console.error(`[polar-webhook] handler error for ${type}:`, e);
    return json({ error: 'handler_error', message: String(e) }, 500);
  }

  return json({ received: true, type });
});
