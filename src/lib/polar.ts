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
 * Polar поддерживает query-параметр customer_email для предзаполнения.
 * Success URL задаётся в дашборде на каждую ссылку отдельно.
 */
export function getPolarCheckoutUrl(product: PolarProduct, email?: string): string | null {
  const base = LINKS[product];
  if (!base) return null;

  const url = new URL(base);
  if (email) url.searchParams.set('customer_email', email);

  return url.toString();
}

/** Редиректит на Polar checkout. Возвращает false если не настроено. */
export function redirectToPolar(product: PolarProduct, email?: string): boolean {
  const url = getPolarCheckoutUrl(product, email);
  if (!url) return false;
  window.location.href = url;
  return true;
}
