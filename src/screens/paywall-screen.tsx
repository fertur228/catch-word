import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { PlanCard } from '@/components/plan-card';
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
import { redirectToPolar } from '@/lib/polar';
import {
  getPremiumPackages,
  isIapConfigured,
  purchasePackage,
  restorePurchases,
} from '@/lib/iap';

const PREMIUM_FEATURES = [
  'Безлимит сканов',
  'Все языки',
  'Умный тест без лимита',
  '«Вся сцена» — много слов за кадр',
  '2–3 примера + грамматика',
  'Экспорт коллекции',
];

const FREE_PLAN: Plan = {
  tier: 'free',
  name: 'Free',
  price: '$0',
  priceNote: 'Бесплатно навсегда',
  features: ['3 скана в день', '2 пары языков', '1 пример на слово', '1 тест в день'],
  ctaLabel: 'Текущий тариф',
};

// Статичные премиум-карточки — запасной вид: для web (оплата через Polar) и на
// нативе ДО настройки RevenueCat. На iOS с настроенным RevenueCat цены и период
// берутся из App Store (см. planFromPackage) — так требует Guideline 3.1.2.
const STATIC_PREMIUM: Plan[] = [
  {
    tier: 'premium',
    name: 'Месяц',
    price: '$6.99',
    priceNote: 'в месяц',
    features: PREMIUM_FEATURES,
    ctaLabel: 'Выбрать месяц',
  },
  {
    tier: 'premium',
    name: 'Год',
    price: '$39.99',
    priceNote: 'в год · 7 дней бесплатно',
    badge: 'Выгодно',
    highlighted: true,
    features: [...PREMIUM_FEATURES, '7 дней бесплатно'],
    ctaLabel: 'Начать 7 дней бесплатно',
  },
];

/** Карточка тарифа из пакета RevenueCat: цена/период — из App Store (не хардкод). */
function planFromPackage(pkg: PurchasesPackage): Plan {
  const isAnnual = String(pkg.packageType) === 'ANNUAL';
  const trial = !!pkg.product.introPrice && pkg.product.introPrice.price === 0;
  return {
    tier: 'premium',
    name: isAnnual ? 'Год' : 'Месяц',
    price: pkg.product.priceString,
    priceNote: isAnnual ? (trial ? 'в год · 7 дней бесплатно' : 'в год') : 'в месяц',
    badge: isAnnual ? 'Выгодно' : undefined,
    highlighted: isAnnual,
    features: trial ? [...PREMIUM_FEATURES, '7 дней бесплатно'] : PREMIUM_FEATURES,
    ctaLabel: trial ? 'Начать 7 дней бесплатно' : isAnnual ? 'Выбрать год' : 'Выбрать месяц',
  };
}

export function PaywallScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const { refresh } = useSubscription();
  const isWeb = Platform.OS === 'web';

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

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

  // --- Реальная покупка (Apple IAP через RevenueCat) ---
  const onBuy = async (pkg: PurchasesPackage) => {
    feedbackTap();
    setBusyId(pkg.identifier);
    try {
      const res = await purchasePackage(pkg);
      if (res.ok) {
        await refresh();
        await alertAsync('Готово 🎉', 'Premium активирован. Спасибо!');
        router.back();
      } else if (!res.cancelled) {
        void alertAsync('Покупка не завершена', 'Премиум не активировался. Попробуй ещё раз.');
      }
      // res.cancelled — пользователь закрыл окно, это не ошибка: молчим.
    } catch {
      void alertAsync('Не удалось купить', 'Попробуй ещё раз или проверь оплату в App Store.');
    } finally {
      setBusyId(null);
    }
  };

  // --- Запасной путь: web (Polar) или натив до настройки RevenueCat ---
  const onStatic = async (plan: Plan) => {
    feedbackTap();
    if (plan.tier === 'free') {
      void alertAsync('Free', 'Это бесплатный тариф — он уже активен.');
      return;
    }
    if (isWeb) {
      // Без аккаунта покупку не к чему привязать (нет reference_id для вебхука).
      if (!user) {
        await alertAsync(
          'Сначала войдите',
          'Войдите через Google — подписка привяжется к вашему аккаунту и будет доступна на всех устройствах.',
        );
        try {
          await signInWithGoogle();
        } catch {
          void alertAsync('Не удалось войти', 'Попробуйте ещё раз.');
        }
        return;
      }
      if (redirectToPolar(user.email ?? undefined, user.id)) return;
      void alertAsync('Скоро', 'Оплата подключается — зайди немного позже.');
      return;
    }
    // Натив, но RevenueCat ещё не настроен (нет ключа/продуктов).
    void alertAsync('Скоро', 'Оплата вот-вот подключится. Загляни немного позже.');
  };

  // --- Восстановление покупок (Apple IAP) ---
  const onRestore = async () => {
    feedbackTap();
    if (!isIapConfigured()) {
      void alertAsync(
        'Восстановление покупок',
        isWeb
          ? 'На вебе подписка привязана к аккаунту — просто войдите.'
          : 'Оплата вот-вот подключится.',
      );
      return;
    }
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        await refresh();
        await alertAsync('Восстановлено', 'Premium возвращён на этот аккаунт.');
        router.back();
      } else {
        void alertAsync('Покупок не найдено', 'На этом Apple ID нет активной подписки.');
      }
    } catch {
      void alertAsync('Не удалось восстановить', 'Попробуй ещё раз.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + Spacing.six }}>
      <Reveal delay={0} distance={16} style={styles.hero}>
        <Sticker symbol="sparkles" tone="primary" size={104} />
        <ThemedText type="title" style={styles.heroTitle}>
          Учи быстрее с Premium
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.heroSubtitle}>
          Весь мир — твой словарь. Больше сканов, все языки и живые примеры.
        </ThemedText>
        <View style={styles.heroPills}>
          <Pill label="7 дней бесплатно" icon="gift.fill" tone="primary" />
          <Pill label="Без скрытых списаний" icon="checkmark" tone="neutral" />
        </View>
      </Reveal>

      <Reveal delay={70}>
        <SectionHeader title="Выбери тариф" icon="sparkles" />
      </Reveal>

      <Reveal delay={90}>
        <PlanCard plan={FREE_PLAN} onPress={() => onStatic(FREE_PLAN)} />
      </Reveal>

      {useReal
        ? packages.map((pkg, i) => (
            <Reveal key={pkg.identifier} delay={120 + i * 70}>
              <PlanCard
                plan={planFromPackage(pkg)}
                onPress={() => onBuy(pkg)}
                loading={busyId === pkg.identifier}
              />
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
            Честно: напомним за 24 часа до конца бесплатного периода. Отменить можно в любой
            момент — без скрытых списаний.
          </ThemedText>
        </View>
      </Reveal>

      <FadeIn delay={480} style={styles.footer}>
        <Pressable onPress={onRestore} disabled={restoring} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="primary" style={styles.restore}>
            {restoring ? 'Восстанавливаем…' : 'Восстановить покупки'}
          </ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
          Подписка с автопродлением. Оплата спишется с Apple ID при подтверждении. Продлевается
          автоматически, пока не отменить минимум за 24 часа до конца периода — в настройках Apple
          ID. Цены для App Store (US).
        </ThemedText>
        <View style={styles.legalLinks}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
            <ThemedText type="small" themeColor="primary" style={styles.legalLink}>
              Условия (EULA)
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <ThemedText type="small" themeColor="primary" style={styles.legalLink}>
              Конфиденциальность
            </ThemedText>
          </Pressable>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
