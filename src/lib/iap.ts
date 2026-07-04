/**
 * Apple IAP через RevenueCat — ТОЛЬКО iOS. На вебе оплата через Polar (см.
 * lib/polar.ts), поэтому там платформенная заглушка iap.web.ts (RevenueCat не грузим).
 *
 * App User ID в RevenueCat = Supabase user.id (= Polar reference_id), чтобы подписка
 * была единой на всех устройствах и платформах. Настройка ключа/продуктов/вебхука —
 * см. docs/PLAN-iap.md. Без ключа (EXPO_PUBLIC_REVENUECAT_IOS_KEY) всё — no-op.
 */
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
/** Entitlement в RevenueCat — его дают все платные тарифы. */
const ENTITLEMENT = 'premium';

/** Готов ли IAP: iOS + задан публичный ключ RevenueCat. */
export function isIapConfigured(): boolean {
  return Platform.OS === 'ios' && IOS_KEY.length > 0;
}

let configured = false;
/** Инициализировать RevenueCat (один раз, на старте). No-op без ключа. */
export function configureIap(): void {
  if (configured || !isIapConfigured()) return;
  Purchases.configure({ apiKey: IOS_KEY });
  configured = true;
}

/** Привязать покупки к аккаунту (Supabase user.id) — единый ключ на всех платформах. */
export async function iapLogIn(userId: string): Promise<void> {
  if (!isIapConfigured()) return;
  try {
    configureIap();
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('iap logIn:', e);
  }
}

/** Отвязать при выходе из аккаунта (RevenueCat уходит в анонимный режим). */
export async function iapLogOut(): Promise<void> {
  if (!isIapConfigured()) return;
  try {
    await Purchases.logOut();
  } catch {
    // уже анонимный — ок
  }
}

/** Пакеты текущего offering (тарифы для пейволла). Пусто, если не настроено. */
export async function getPremiumPackages(): Promise<PurchasesPackage[]> {
  if (!isIapConfigured()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (e) {
    console.warn('iap offerings:', e);
    return [];
  }
}

/** Активен ли премиум по CustomerInfo. */
export function hasPremium(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[ENTITLEMENT];
}

/** Проверить премиум прямо сейчас (запрос к RevenueCat). */
export async function isPremiumNow(): Promise<boolean> {
  if (!isIapConfigured()) return false;
  try {
    return hasPremium(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

export interface PurchaseResult {
  /** Премиум активен после покупки. */
  ok: boolean;
  /** Пользователь отменил (это не ошибка — молча закрываем). */
  cancelled: boolean;
}

/** Купить пакет. Отмену возвращаем как cancelled, прочие ошибки — бросаем наверх. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!isIapConfigured()) return { ok: false, cancelled: false };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: hasPremium(customerInfo), cancelled: false };
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return { ok: false, cancelled: true };
    throw e;
  }
}

/** Восстановить покупки. true — премиум восстановлен. */
export async function restorePurchases(): Promise<boolean> {
  if (!isIapConfigured()) return false;
  return hasPremium(await Purchases.restorePurchases());
}

/**
 * Подписаться на изменения entitlements RevenueCat (покупка / продление / истечение /
 * restore). Вызывается один раз — чтобы useSubscription мгновенно применял премиум ко
 * всем экранам без перезапуска приложения. Без ключа/на web — no-op (см. iap.web.ts).
 */
export function addPremiumListener(cb: () => void): void {
  if (!isIapConfigured()) return;
  try {
    configureIap();
    Purchases.addCustomerInfoUpdateListener(() => cb());
  } catch (e) {
    console.warn('iap addPremiumListener:', e);
  }
}
