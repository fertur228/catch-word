/**
 * DodoPayments — веб-оплата (только Platform.OS === 'web').
 *
 * Настройка:
 *  1. Зарегистрируйся на dodopayments.com
 *  2. Создай 5 продуктов (тип Subscription или One-time):
 *       Basic Monthly, Basic Yearly, Premium Monthly, Premium Yearly, Lifetime
 *  3. В дашборде → Payment Links → создай ссылку для каждого продукта
 *  4. Скопируй URL вида https://checkout.dodopayments.com/buy/plink_xxxx
 *  5. Вставь их в .env (и в Cloudflare Pages → Settings → Environment Variables):
 *
 *     EXPO_PUBLIC_DODO_LINK_BASIC_MONTHLY=https://checkout.dodopayments.com/buy/plink_...
 *     EXPO_PUBLIC_DODO_LINK_BASIC_YEARLY=https://checkout.dodopayments.com/buy/plink_...
 *     EXPO_PUBLIC_DODO_LINK_PREMIUM_MONTHLY=https://checkout.dodopayments.com/buy/plink_...
 *     EXPO_PUBLIC_DODO_LINK_PREMIUM_YEARLY=https://checkout.dodopayments.com/buy/plink_...
 *     EXPO_PUBLIC_DODO_LINK_LIFETIME=https://checkout.dodopayments.com/buy/plink_...
 */

const LINKS = {
  basic_monthly:   process.env.EXPO_PUBLIC_DODO_LINK_BASIC_MONTHLY   ?? '',
  basic_yearly:    process.env.EXPO_PUBLIC_DODO_LINK_BASIC_YEARLY    ?? '',
  premium_monthly: process.env.EXPO_PUBLIC_DODO_LINK_PREMIUM_MONTHLY ?? '',
  premium_yearly:  process.env.EXPO_PUBLIC_DODO_LINK_PREMIUM_YEARLY  ?? '',
  lifetime:        process.env.EXPO_PUBLIC_DODO_LINK_LIFETIME         ?? '',
} as const;

export type DodoProduct = keyof typeof LINKS;

/** true — все нужные переменные окружения выставлены и непустые. */
export function isDodoConfigured(): boolean {
  return Object.values(LINKS).some((v) => v.length > 0);
}

/**
 * Строит checkout URL с параметрами:
 *  - success_url: /payment-success (текущий origin, работает на любом домене)
 *  - cancel_url: /paywall
 *  - customer[email]: если передан (Google-аккаунт) — предзаполнит поле
 */
export function getDodoCheckoutUrl(product: DodoProduct, email?: string): string | null {
  const base = LINKS[product];
  if (!base) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://catch-words.com';

  const url = new URL(base);
  url.searchParams.set('success_url', `${origin}/payment-success`);
  url.searchParams.set('cancel_url', `${origin}/paywall`);
  if (email) url.searchParams.set('customer[email]', email);

  return url.toString();
}

/** Редиректит на DodoPayments checkout. Возвращает false если не настроено. */
export function redirectToDodo(product: DodoProduct, email?: string): boolean {
  const url = getDodoCheckoutUrl(product, email);
  if (!url) return false;
  window.location.href = url;
  return true;
}
