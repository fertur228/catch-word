// Supabase Edge Function: /polar-webhook
// ─────────────────────────────────────────────────────────────────────────────
// Принимает вебхуки от Polar (polar.sh), верифицирует HMAC-SHA256 подпись и
// обновляет таблицу `subscriptions`.
//
// Секреты (supabase secrets set …):
//   POLAR_WEBHOOK_SECRET      — Signing Secret из Polar → Webhooks → эндпоинт (вид whsec_…)
//   SUPABASE_URL              — Project URL (есть в Edge Runtime по умолчанию)
//   SUPABASE_SERVICE_ROLE_KEY — service_role key (есть по умолчанию)
//
// ВАЖНО ПРИ ДЕПЛОЕ: verify_jwt=false (config.toml [functions.polar-webhook] +
// флаг --no-verify-jwt). У Polar своя HMAC-подпись, а не Supabase-JWT; при
// verify_jwt=true шлюз отбивает КАЖДЫЙ запрос Polar с 401 ещё до кода функции.
//
// ПОДПИСЬ: этот эндпоинт Polar подписывает СЫРОЙ строкой секрета (вместе с
// префиксом whsec_) как UTF-8 ключом — это НЕ канонический Standard Webhooks
// (там ключ = base64-decode части после whsec_). Чтобы не зависеть от этой
// детали и пережить смену секрета/формата, принимаем подпись, совпавшую по
// ЛЮБОМУ из известных способов вывода ключа (каждый требует знания секрета).
//
// Подписываемых событий в Polar:
//   subscription.created / active / updated / uncanceled / canceled / past_due / revoked
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

async function hmacSig(keyBytes: Uint8Array, content: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const s = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content));
  return 'v1,' + btoa(String.fromCharCode(...new Uint8Array(s)));
}

// Standard Webhooks: подписываемый контент = `{webhook-id}.{webhook-timestamp}.{raw-body}`.
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  try {
    const msgId     = req.headers.get('webhook-id');
    const timestamp = req.headers.get('webhook-timestamp');
    const sigHeader = req.headers.get('webhook-signature');

    if (!msgId || !timestamp || !sigHeader) return false;
    // Только базовая валидация формата. Раньше здесь стояла проверка «отклонять
    // события старше 5 минут» — она ломала повторные доставки Polar (retry/redeliver
    // несёт ИСХОДНЫЙ timestamp, и через 5 минут любая повторная доставка получала
    // 401 навсегда). Подпись HMAC подтверждает подлинность, upsert идемпотентен —
    // по возрасту события больше НЕ отклоняем.
    if (!/^\d+$/.test(timestamp)) return false;

    const content  = `${msgId}.${timestamp}.${rawBody}`;
    const trimmed  = POLAR_WEBHOOK_SECRET.trim();
    const noPrefix = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;

    // Кандидаты ключа (по убыванию вероятности для текущего эндпоинта Polar):
    //   1) сырая строка секрета С префиксом whsec_ (так подписывает наш Polar)
    //   2) сырая строка без префикса
    //   3) base64-decode без префикса (канонический Standard Webhooks)
    const keys: Uint8Array[] = [
      new TextEncoder().encode(trimmed),
      new TextEncoder().encode(noPrefix),
    ];
    try { keys.push(Uint8Array.from(atob(noPrefix), (c) => c.charCodeAt(0))); } catch { /* не base64 */ }

    // Заголовок может содержать несколько подписей через пробел (ротация секретов).
    const parts = sigHeader.split(' ');
    for (const k of keys) {
      const expected = await hmacSig(k, content);
      if (parts.some((p) => p === expected)) return true;
    }
    return false;
  } catch (e) {
    // Никогда не роняем функцию в 500 из-за формата секрета — иначе Polar ретраит бесконечно.
    console.error('[polar-webhook] verifySignature error:', e);
    return false;
  }
}

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

// Polar recurring_interval → наш plan (weekly | monthly | yearly).
function mapPlan(data: AnyRecord): string | null {
  const iv = (data.recurring_interval ?? data.product?.recurring_interval ?? '')
    .toString()
    .toLowerCase();
  if (iv === 'week')  return 'weekly';
  if (iv === 'month') return 'monthly';
  if (iv === 'year')  return 'yearly';
  return null;
}

// Резервная привязка по email, если reference_id не пришёл в metadata.
async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  if (!email) return null;
  try {
    const target = email.toLowerCase();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return null;
    const u = data.users.find((x) => (x.email ?? '').toLowerCase() === target);
    return u?.id ?? null;
  } catch {
    return null;
  }
}

// ── Обработчики событий ───────────────────────────────────────────────────────

async function handleSubscriptionEvent(
  admin: ReturnType<typeof createClient>,
  eventType: string,
  data: AnyRecord,
): Promise<void> {
  const subId      = data.id as string;
  const metadata   = (data.metadata ?? {}) as Record<string, string>;
  const email      = (data.customer?.email ?? '') as string;
  const customerId = (data.customer_id ?? data.customer?.id ?? '') as string;

  // Основной путь — reference_id (Supabase UUID) из checkout-метаданных.
  // Запасной — поиск по email.
  const userId = metadata.reference_id ?? (await findUserIdByEmail(admin, email));

  const status: string = eventType === 'subscription.revoked'
    ? 'revoked'
    : (data.status as string) ?? 'active';

  const currentPeriodEnd = (data.current_period_end as string | null) ?? null;
  const trialEnd         = (data.trial_end as string | null) ?? null;
  const cancelledAt      = status === 'canceled'
    ? ((data.ended_at as string | null) ?? new Date().toISOString())
    : null;
  const plan = mapPlan(data);

  if (userId) {
    // Знаем пользователя — полный upsert по polar_subscription_id.
    const { error } = await admin.from('subscriptions').upsert(
      {
        user_id:               userId,
        email,
        polar_subscription_id: subId,
        polar_customer_id:     customerId,
        status,
        plan,
        current_period_end:    currentPeriodEnd,
        trial_end:             trialEnd,
        cancelled_at:          cancelledAt,
        updated_at:            new Date().toISOString(),
      },
      { onConflict: 'polar_subscription_id' },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  } else {
    // Не определили пользователя (нет reference_id и email не совпал). Вставить
    // новую строку нельзя (user_id NOT NULL). Обновляем существующую по subId,
    // если её нет — ГРОМКО логируем, чтобы оплата не терялась молча.
    const { data: upd, error } = await admin
      .from('subscriptions')
      .update({
        status,
        plan,
        current_period_end: currentPeriodEnd,
        trial_end:          trialEnd,
        cancelled_at:       cancelledAt,
        updated_at:         new Date().toISOString(),
      })
      .eq('polar_subscription_id', subId)
      .select('id');
    if (error) throw new Error(`update failed: ${error.message}`);
    if (!upd || upd.length === 0) {
      console.error(
        `[polar-webhook] UNBOUND paid subscription id=${subId} email=${email}: ` +
        `нет reference_id и email не найден среди пользователей — доступ НЕ выдан.`,
      );
    }
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

  if (!(await verifySignature(req, rawBody))) {
    return json({ error: 'invalid_signature' }, 401);
  }

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
    // Остальные события (checkout.*, customer.*, …) игнорируем — возвращаем 200.
  } catch (e) {
    console.error(`[polar-webhook] handler error for ${type}:`, e);
    return json({ error: 'handler_error', message: String(e) }, 500);
  }

  return json({ received: true, type });
});
