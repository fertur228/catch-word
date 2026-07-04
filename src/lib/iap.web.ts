/**
 * Web-заглушка IAP: на вебе оплата идёт через Polar (см. lib/polar.ts), а не через
 * Apple IAP. Все функции — no-op, чтобы общий код (пейволл/подписка) работал без
 * нативного модуля react-native-purchases (на web он не бандлится).
 */
import type { PurchasesPackage } from 'react-native-purchases';

export function isIapConfigured(): boolean {
  return false;
}
export function configureIap(): void {}
export async function iapLogIn(_userId: string): Promise<void> {}
export async function iapLogOut(): Promise<void> {}
export async function getPremiumPackages(): Promise<PurchasesPackage[]> {
  return [];
}
export function hasPremium(_info: unknown): boolean {
  return false;
}
export async function isPremiumNow(): Promise<boolean> {
  return false;
}

export interface PurchaseResult {
  ok: boolean;
  cancelled: boolean;
}

export async function purchasePackage(_pkg: PurchasesPackage): Promise<PurchaseResult> {
  return { ok: false, cancelled: false };
}
export async function restorePurchases(): Promise<boolean> {
  return false;
}
export function addPremiumListener(_cb: () => void): void {}
