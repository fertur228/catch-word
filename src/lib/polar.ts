/**
 * Polar (polar.sh) — веб-оплата (только Platform.OS === 'web').
 *
 * Настройка:
 *  1. Зарегистрируйся на polar.sh и создай организацию
 *  2. Products → создай 5 продуктов:
 *       Basic Monthly, Basic Yearly, Premium Monthly, Premium Yearly, Lifetime
 *  3. Для каждого продукта → Checkout Links → создай ссылку
 *     URL вида: https://buy.polar.sh/polar_cl_xxxxxxxxxxxx
 *  4. В настройках каждой ссылки добавь Success URL: https://catch-words.com/payment-success
 *  5. Вставь ссылки в .env и в Cloudflare Pages → Settings → Environment Variables:
 *
 *     EXPO_PUBLIC_POLAR_LINK_BASIC_MONTHLY=https://buy.polar.sh/polar_cl_...
 *     EXPO_PUBLIC_POLAR_LINK_BASIC_YEARLY=https://buy.polar.sh/polar_cl_...
 *     EXPO_PUBLIC_POLAR_LINK_PREMIUM_MONTHLY=https://buy.polar.sh/polar_cl_...
 *     EXPO_PUBLIC_POLAR_LINK_PREMIUM_YEARLY=https://buy.polar.sh/polar_cl_...
 *     EXPO_PUBLIC_POLAR_LINK_LIFETIME=https://buy.polar.sh/polar_cl_...
 */

const LINKS = {
  basic_monthly:   process.env.EXPO_PUBLIC_POLAR_LINK_BASIC_MONTHLY   ?? '',
  basic_yearly:    process.env.EXPO_PUBLIC_POLAR_LINK_BASIC_YEARLY    ?? '',
  premium_monthly: process.env.EXPO_PUBLIC_POLAR_LINK_PREMIUM_MONTHLY ?? '',
  premium_yearly:  process.env.EXPO_PUBLIC_POLAR_LINK_PREMIUM_YEARLY  ?? '',
  lifetime:        process.env.EXPO_PUBLIC_POLAR_LINK_LIFETIME         ?? '',
} as const;

export type PolarProduct = keyof typeof LINKS;

/** true — хотя бы одна ссылка задана. */
export function isPolarConfigured(): boolean {
  return Object.values(LINKS).some((v) => v.length > 0);
}

/**
 * Строит checkout URL.
 * - customer_email: предзаполняет email в форме Polar.
 * - reference_id:   Supabase user UUID, копируется Polar в метаданные сессии →
 *                   ордера → подписки → вебхука. Так polar-webhook знает, кому
 *                   выдать доступ без поиска по email.
 */
export function getPolarCheckoutUrl(
  product: PolarProduct,
  email?: string,
  userId?: string,
): string | null {
  const base = LINKS[product];
  if (!base) return null;

  const url = new URL(base);
  if (email)  url.searchParams.set('customer_email', email);
  if (userId) url.searchParams.set('reference_id', userId);

  return url.toString();
}

/** Редиректит на Polar checkout. Возвращает false если не настроено. */
export function redirectToPolar(
  product: PolarProduct,
  email?: string,
  userId?: string,
): boolean {
  const url = getPolarCheckoutUrl(product, email, userId);
  if (!url) return false;
  window.location.href = url;
  return true;
}
