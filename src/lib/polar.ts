/**
 * Polar (polar.sh) — веб-оплата (только Platform.OS === 'web').
 *
 * Одна checkout-ссылка на все тарифы (Weekly/Monthly/Yearly) —
 * юзер выбирает тариф прямо на странице Polar.
 *
 * Настройка:
 *  1. Polar → Checkout Links → создай одну ссылку для всех продуктов
 *     URL вида: https://buy.polar.sh/polar_cl_xxxxxxxxxxxx
 *  2. В настройках ссылки: Success URL = https://catch-words.com/payment-success
 *  3. Вставь ссылку в .env и Cloudflare Pages → Settings → Environment Variables:
 *
 *     EXPO_PUBLIC_POLAR_CHECKOUT_LINK=https://buy.polar.sh/polar_cl_...
 */

const CHECKOUT_LINK = process.env.EXPO_PUBLIC_POLAR_CHECKOUT_LINK ?? '';

/** true — ссылка задана. */
export function isPolarConfigured(): boolean {
  return CHECKOUT_LINK.length > 0;
}

/**
 * Строит checkout URL.
 * - customer_email: предзаполняет email в форме Polar.
 * - reference_id:   Supabase user UUID, копируется Polar в метаданные сессии →
 *                   ордера → подписки → вебхука. Так polar-webhook знает, кому
 *                   выдать доступ без поиска по email.
 */
export function getPolarCheckoutUrl(email?: string, userId?: string): string | null {
  if (!CHECKOUT_LINK) return null;

  const url = new URL(CHECKOUT_LINK);
  if (email)  url.searchParams.set('customer_email', email);
  if (userId) url.searchParams.set('reference_id', userId);

  return url.toString();
}

/** Редиректит на Polar checkout. Возвращает false если не настроено. */
export function redirectToPolar(email?: string, userId?: string): boolean {
  const url = getPolarCheckoutUrl(email, userId);
  if (!url) return false;
  window.location.href = url;
  return true;
}
