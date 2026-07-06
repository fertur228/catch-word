import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { addPremiumListener, isPremiumNow } from '@/lib/iap';

export type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'revoked';

// ─────────────────────────────────────────────────────────────────────────
// ЕДИНЫЙ стор подписки — один на всё приложение (не по инстансу хука).
// Раньше каждый useSubscription() держал СВОЙ стейт и перечитывал статус только
// при смене сессии. Поэтому после покупки премиум применялся у пейволла (он звал
// refresh), но НЕ у CollectionProvider — и лимиты сканов/тестов/языков не снимались
// до полного перезапуска приложения. Теперь состояние общее: любой refresh (ручной,
// из слушателя RevenueCat при покупке/продлении/истечении, или при возврате в
// приложение) обновляет ВСЕ экраны разом — премиум применяется мгновенно.
// ─────────────────────────────────────────────────────────────────────────

/** Тип тарифа (колонка subscriptions.plan). */
export type SubPlan = 'monthly' | 'yearly';

interface SubSnapshot {
  isPremium: boolean;
  status: SubscriptionStatus;
  /** Тариф активной подписки (null — free или вебхук ещё не пришёл). */
  plan: SubPlan | null;
  /** ISO-конец текущего периода: дата продления (active) или окончания (trial/canceled). */
  currentPeriodEnd: string | null;
  loading: boolean;
}

let snapshot: SubSnapshot = {
  isPremium: false,
  status: 'free',
  plan: null,
  currentPeriodEnd: null,
  loading: true,
};
const listeners = new Set<() => void>();

/** useSyncExternalStore требует стабильную ссылку, пока данные не менялись. */
function getSnapshot(): SubSnapshot {
  return snapshot;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Опубликовать новое состояние — только если реально изменилось (без лишних ре-рендеров). */
function publish(next: SubSnapshot): void {
  if (
    next.isPremium === snapshot.isPremium &&
    next.status === snapshot.status &&
    next.plan === snapshot.plan &&
    next.currentPeriodEnd === snapshot.currentPeriodEnd &&
    next.loading === snapshot.loading
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((l) => l());
}

// Схлопываем одновременные перечитки (на старте 4 инстанса + слушатели могут дёрнуть разом).
let inFlight: Promise<void> | null = null;

async function doRefresh(): Promise<void> {
  // Сессию читаем из supabase напрямую — чтобы refresh мог вызываться и из слушателей
  // (RevenueCat / AppState), где React-сессии под рукой нет.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  let premium = false;
  let status: SubscriptionStatus = 'free';
  let plan: SubPlan | null = null;
  let currentPeriodEnd: string | null = null;

  if (userId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      status = (data.status as SubscriptionStatus) ?? 'free';
      plan = (data.plan as SubPlan | null) ?? null;
      currentPeriodEnd = (data.current_period_end as string | null) ?? null;
      const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
      // Активен если: active, trialing, или canceled но ещё не истёк период.
      premium =
        status === 'active' ||
        status === 'trialing' ||
        (status === 'canceled' && periodEnd !== null && periodEnd > new Date());
    }
  }

  // iOS: RevenueCat-entitlement даёт премиум мгновенно после покупки — ещё до того как
  // вебхук запишет строку в subscriptions. На web и без ключа isPremiumNow() = false.
  if (!premium) {
    const rc = await isPremiumNow();
    if (rc) {
      premium = true;
      if (status === 'free') status = 'active';
    }
  }

  publish({ isPremium: premium, status, plan, currentPeriodEnd, loading: false });
}

/** Перечитать статус подписки и обновить ВСЕ экраны. Одновременные вызовы схлопываются. */
export function refreshSubscription(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doRefresh()
    .catch(() => {
      // сеть недоступна — снимаем loading, прошлый статус оставляем как есть
      publish({ ...snapshot, loading: false });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// Глобальные триггеры перечитки — ставим ОДИН раз на всё приложение.
let wired = false;
function wireOnce(): void {
  if (wired) return;
  wired = true;
  // RevenueCat: entitlements изменились (покупка / продление / истечение / restore) →
  // мгновенно применяем премиум без перезапуска. На web — no-op.
  addPremiumListener(() => {
    void refreshSubscription();
  });
  // Возврат в приложение — перечитываем (ловит изменения из вебхука и с других устройств;
  // работает и на web, где RevenueCat нет).
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void refreshSubscription();
  });
}

export function useSubscription() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Перечитываем при монтировании и при смене аккаунта; глобальные слушатели ставим один раз.
  useEffect(() => {
    wireOnce();
    void refreshSubscription();
  }, [userId]);

  const refresh = useCallback(() => refreshSubscription(), []);

  return {
    isPremium: snap.isPremium,
    status: snap.status,
    plan: snap.plan,
    currentPeriodEnd: snap.currentPeriodEnd,
    loading: snap.loading,
    refresh,
  };
}
