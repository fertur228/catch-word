import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn as EnterFade } from 'react-native-reanimated';
import type { PurchasesPackage } from 'react-native-purchases';

import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { PlanCard } from '@/components/plan-card';
import { PurchaseStateView } from '@/components/purchase-state';
import { Reveal, FadeIn } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useSubscription } from '@/lib/subscription';
import type { Plan } from '@/types';
import { PRIVACY_URL, TERMS_URL } from '@/constants/links';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';
import { t, useT, getLang } from '@/lib/i18n';
import { redirectToPolar } from '@/lib/polar';
import {
  getPremiumPackages,
  isIapConfigured,
  purchasePackage,
  restorePurchases,
} from '@/lib/iap';

// Функции (не константы!) — вызываются в рендере, поэтому t() читает АКТУАЛЬНЫЙ
// язык и карточки реагируют на смену языка (константы на уровне модуля были бы
// «заморожены» на дефолтном языке при импорте).
const premiumFeatures = (): string[] => [
  t('Безлимит сканов'),
  t('Все языки'),
  t('Умный тест без лимита'),
  t('«Вся сцена» — много слов за кадр'),
  t('2–3 примера + грамматика'),
  t('Экспорт коллекции'),
];

// Коротко «что открылось» — для экрана успеха покупки/восстановления.
const premiumUnlocks = (): string[] => [t('Безлимит сканов'), t('Все языки'), t('Умный тест без лимита')];

const freePlan = (): Plan => ({
  tier: 'free',
  name: 'Free',
  price: '$0',
  priceNote: t('Бесплатно навсегда'),
  features: [t('5 сканов в день'), t('2 пары языков'), t('1 пример на слово'), t('1 тест в день')],
  ctaLabel: t('Текущий тариф'),
});

// Статичные премиум-карточки — запасной вид: для web (оплата через Polar) и на
// нативе ДО настройки RevenueCat. На iOS с настроенным RevenueCat цены и период
// берутся из App Store (см. planFromPackage) — так требует Guideline 3.1.2.
const staticPremium = (): Plan[] => [
  {
    tier: 'premium',
    name: t('Месяц'),
    price: '$6.99',
    priceNote: t('в месяц'),
    features: premiumFeatures(),
    ctaLabel: t('Выбрать месяц'),
    caption: t('$6.99/мес, автопродление. Отмена в любой момент.'),
  },
  {
    tier: 'premium',
    name: t('Год'),
    price: '$39.99',
    priceNote: t('в год'),
    priceSub: t('≈ $3.33/мес · экономия 52%'),
    badge: t('Выгодно'),
    highlighted: true,
    features: [...premiumFeatures(), t('7 дней бесплатно')],
    ctaLabel: t('Начать 7 дней бесплатно'),
    caption: t('Бесплатно 7 дней, затем $39.99/год. Отмена в любой момент.'),
  },
];

/**
 * Карточка тарифа из пакета RevenueCat: цена/период — из App Store (не хардкод).
 * Для годового показываем разбивку «в месяц» (pricePerMonthString от RevenueCat) и
 * экономию vs 12× месячного (savingsPct считается на экране, где есть оба пакета).
 */
function planFromPackage(pkg: PurchasesPackage, savingsPct?: number): Plan {
  const isAnnual = String(pkg.packageType) === 'ANNUAL';
  const trial = !!pkg.product.introPrice && pkg.product.introPrice.price === 0;
  const price = pkg.product.priceString;
  const en = getLang() === 'en';
  const period = isAnnual ? (en ? 'year' : 'год') : (en ? 'month' : 'мес');
  // Разбивка + экономия — только на годовом (там это реально помогает сравнить).
  const priceSub = isAnnual
    ? [
        pkg.product.pricePerMonthString ? `≈ ${pkg.product.pricePerMonthString}${en ? '/mo' : '/мес'}` : null,
        savingsPct && savingsPct > 0 ? (en ? `save ${savingsPct}%` : `экономия ${savingsPct}%`) : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined
    : undefined;
  return {
    tier: 'premium',
    name: isAnnual ? t('Год') : t('Месяц'),
    price,
    priceNote: isAnnual ? t('в год') : t('в месяц'),
    priceSub,
    badge: isAnnual ? t('Выгодно') : undefined,
    highlighted: isAnnual,
    features: trial ? [...premiumFeatures(), t('7 дней бесплатно')] : premiumFeatures(),
    ctaLabel: trial ? t('Начать 7 дней бесплатно') : isAnnual ? t('Выбрать год') : t('Выбрать месяц'),
    caption: trial
      ? en
        ? `Free for 7 days, then ${price}/${period}. Cancel anytime.`
        : `Бесплатно 7 дней, затем ${price}/${period}. Отмена в любой момент.`
      : en
        ? `${price}/${period}, auto-renews. Cancel anytime.`
        : `${price}/${period}, автопродление. Отмена в любой момент.`,
  };
}

// Состояние экрана покупки (нативный оверлей поверх пейволла). idle — обычный
// пейволл; остальное — полноэкранный PurchaseStateView. Отмена возвращает в idle
// молча, без ошибки. Логику покупки/применения премиума это не трогает.
type Flow =
  | { kind: 'idle' }
  | { kind: 'buying' }
  | { kind: 'restoring' }
  | { kind: 'success'; restored?: boolean }
  | { kind: 'empty' }
  | { kind: 'error'; retry: () => void };

export function PaywallScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const { refresh } = useSubscription();
  const isWeb = Platform.OS === 'web';

  // Считаем в рендере (реагируют на смену языка через useT-перерисовку).
  const FREE_PLAN = freePlan();
  const STATIC_PREMIUM = staticPremium();
  const PREMIUM_UNLOCKS = premiumUnlocks();

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' });

  // Тарифы из RevenueCat (нативно). Пусто на web и до настройки ключа.
  useEffect(() => {
    let alive = true;
    getPremiumPackages()
      .then((p) => alive && setPackages(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Реальные покупки доступны только на iOS с настроенным RevenueCat.
  const useReal = !isWeb && packages.length > 0;

  // Экономия годового vs 12× месячного — строка «экономия X%» на годовой карточке
  // (приём топ-аппов). Считаем из реальных цен, только если есть оба пакета.
  const monthlyPrice = packages.find((p) => String(p.packageType) === 'MONTHLY')?.product.price;
  const annualPrice = packages.find((p) => String(p.packageType) === 'ANNUAL')?.product.price;
  const savingsPct =
    monthlyPrice && annualPrice && monthlyPrice > 0
      ? Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100)
      : undefined;

  // --- Реальная покупка (Apple IAP через RevenueCat) ---
  const onBuy = async (pkg: PurchasesPackage) => {
    feedbackTap();
    setFlow({ kind: 'buying' });
    try {
      const res = await purchasePackage(pkg);
      if (res.ok) {
        await refresh();
        setFlow({ kind: 'success' });
      } else if (res.cancelled) {
        // Пользователь закрыл окно оплаты — это не ошибка: тихо возвращаемся в пейволл.
        setFlow({ kind: 'idle' });
      } else {
        setFlow({ kind: 'error', retry: () => void onBuy(pkg) });
      }
    } catch {
      setFlow({ kind: 'error', retry: () => void onBuy(pkg) });
    }
  };

  // --- Запасной путь: web (Polar) или натив до настройки RevenueCat ---
  const onStatic = async (plan: Plan) => {
    feedbackTap();
    if (plan.tier === 'free') {
      void alertAsync('Free', t('Это бесплатный тариф — он уже активен.'));
      return;
    }
    if (isWeb) {
      // Без аккаунта покупку не к чему привязать (нет reference_id для вебхука).
      if (!user) {
        await alertAsync(
          t('Сначала войдите'),
          t('Войдите через Google — подписка привяжется к вашему аккаунту и будет доступна на всех устройствах.'),
        );
        try {
          await signInWithGoogle();
        } catch {
          void alertAsync(t('Не удалось войти'), t('Попробуйте ещё раз.'));
        }
        return;
      }
      if (redirectToPolar(user.email ?? undefined, user.id)) return;
      void alertAsync(t('Скоро'), t('Оплата подключается — зайди немного позже.'));
      return;
    }
    // Натив, но RevenueCat ещё не настроен (нет ключа/продуктов).
    void alertAsync(t('Скоро'), t('Оплата вот-вот подключится. Загляни немного позже.'));
  };

  // --- Восстановление покупок (Apple IAP) ---
  const onRestore = async () => {
    feedbackTap();
    if (!isIapConfigured()) {
      void alertAsync(
        t('Восстановление покупок'),
        isWeb
          ? t('На вебе подписка привязана к аккаунту — просто войдите.')
          : t('Оплата вот-вот подключится.'),
      );
      return;
    }
    setFlow({ kind: 'restoring' });
    try {
      const ok = await restorePurchases();
      if (ok) {
        await refresh();
        setFlow({ kind: 'success', restored: true });
      } else {
        setFlow({ kind: 'empty' });
      }
    } catch {
      setFlow({ kind: 'error', retry: () => void onRestore() });
    }
  };

  // Закрыть оверлей и пейволл после успеха — премиум уже применён стором подписки.
  const finishSuccess = () => {
    setFlow({ kind: 'idle' });
    router.back();
  };

  const busy = flow.kind === 'buying' || flow.kind === 'restoring';

  return (
    <View style={styles.root}>
      <Screen scroll contentStyle={{ paddingBottom: insets.bottom + Spacing.six }}>
        <Reveal delay={0} distance={16} style={styles.hero}>
          <Sticker symbol="sparkles" tone="primary" size={104} />
          <ThemedText type="title" style={styles.heroTitle}>
            {t('Учи быстрее с Premium')}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.heroSubtitle}>
            {t('Весь мир — твой словарь. Больше сканов, все языки и живые примеры.')}
          </ThemedText>
          <View style={styles.heroPills}>
            <Pill label={t('7 дней бесплатно')} icon="gift.fill" tone="primary" />
            <Pill label={t('Без скрытых списаний')} icon="checkmark" tone="neutral" />
          </View>
        </Reveal>

        <Reveal delay={70}>
          <SectionHeader title={t('Выбери тариф')} icon="sparkles" />
        </Reveal>

        <Reveal delay={90}>
          <PlanCard plan={FREE_PLAN} onPress={() => onStatic(FREE_PLAN)} />
        </Reveal>

        {useReal
          ? packages.map((pkg, i) => (
              <Reveal key={pkg.identifier} delay={120 + i * 70}>
                <PlanCard plan={planFromPackage(pkg, savingsPct)} onPress={() => onBuy(pkg)} />
              </Reveal>
            ))
          : STATIC_PREMIUM.map((plan, i) => (
              <Reveal key={plan.name} delay={120 + i * 70}>
                <PlanCard plan={plan} onPress={() => onStatic(plan)} />
              </Reveal>
            ))}

        <Reveal delay={400}>
          <View style={[styles.honest, { backgroundColor: theme.accent2Soft }]}>
            <Icon name="bell.fill" size={18} color={theme.accent2} />
            <ThemedText type="small" style={styles.honestText}>
              {t('Честно: напомним за 24 часа до конца бесплатного периода. Отменить можно в любой момент — без скрытых списаний.')}
            </ThemedText>
          </View>
        </Reveal>

        <FadeIn delay={480} style={styles.footer}>
          <Pressable onPress={onRestore} disabled={busy} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.restore}>
              {t('Восстановить покупки')}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
            {isWeb
              ? t('Подписка с автопродлением. Оплата спишется с вашей карты через Polar. Продлевается автоматически — отменить можно в любой момент в личном кабинете Polar. Цены в долларах США.')
              : t('Подписка с автопродлением. Оплата спишется с Apple ID при подтверждении. Продлевается автоматически, пока не отменить минимум за 24 часа до конца периода — в настройках Apple ID. Цены для App Store (US).')}
          </ThemedText>
          <View style={styles.legalLinks}>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
              <ThemedText type="small" themeColor="primary" style={styles.legalLink}>
                {t('Условия (EULA)')}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
              <ThemedText type="small" themeColor="primary" style={styles.legalLink}>
                {t('Конфиденциальность')}
              </ThemedText>
            </Pressable>
          </View>
        </FadeIn>
      </Screen>

      {/* Полноэкранный оверлей состояний покупки (натив). Отмена → снова пейволл. */}
      {flow.kind !== 'idle' ? (
        <Animated.View
          entering={EnterFade.duration(180)}
          style={StyleSheet.absoluteFill}
          pointerEvents="auto">
          {flow.kind === 'buying' ? (
            <PurchaseStateView
              kind="loading"
              title={t('Обрабатываем покупку…')}
              subtitle={t('Подтвердите оплату — это займёт пару секунд.')}
            />
          ) : flow.kind === 'restoring' ? (
            <PurchaseStateView
              kind="loading"
              title={t('Восстанавливаем покупки…')}
              subtitle={t('Проверяем ваш Apple ID.')}
            />
          ) : flow.kind === 'success' ? (
            <PurchaseStateView
              kind="success"
              title={flow.restored ? t('Покупки восстановлены 🎉') : t('Premium активирован 🎉')}
              subtitle={
                flow.restored
                  ? t('Ваша подписка снова с вами — всё открыто.')
                  : t('Спасибо! Теперь всё открыто — учись без границ.')
              }
              features={PREMIUM_UNLOCKS}
              primary={{ label: t('Начать'), icon: 'arrow.right', onPress: finishSuccess }}
            />
          ) : flow.kind === 'empty' ? (
            <PurchaseStateView
              kind="info"
              iconName="magnifyingglass"
              tone="textSecondary"
              title={t('Покупок не найдено')}
              subtitle={t('На этом Apple ID нет активной подписки. Если оплачивали с другого — войдите в тот аккаунт.')}
              primary={{ label: t('Понятно'), onPress: () => setFlow({ kind: 'idle' }) }}
            />
          ) : (
            <PurchaseStateView
              kind="error"
              title={t('Не получилось')}
              subtitle={t('Покупка не завершилась, деньги не списаны. Давай попробуем ещё раз.')}
              primary={{ label: t('Попробовать снова'), icon: 'arrow.clockwise', onPress: flow.retry }}
              secondary={{ label: t('Закрыть'), onPress: () => setFlow({ kind: 'idle' }) }}
            />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
  heroTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  heroSubtitle: { textAlign: 'center', maxWidth: 320 },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },

  honest: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  honestText: { flex: 1 },

  footer: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  restore: { textDecorationLine: 'underline', paddingVertical: Spacing.two },
  legal: { textAlign: 'center', maxWidth: 340 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  legalLink: { textDecorationLine: 'underline' },
});
