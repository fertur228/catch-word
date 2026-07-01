import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import type { Plan } from '@/types';
import { PRIVACY_URL, TERMS_URL } from '@/constants/links';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';
import { isPolarConfigured, redirectToPolar } from '@/lib/polar';

const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    priceNote: 'Бесплатно навсегда',
    features: [
      '10 сканов',
      '1 язык',
      '1 пример на слово',
      'Коллекция и просмотр',
    ],
    ctaLabel: 'Текущий тариф',
  },
  {
    tier: 'premium',
    name: 'Неделя',
    price: '$4.99',
    priceNote: 'в неделю',
    features: [
      'Безлимит сканов',
      'Все языки',
      '2–3 примера + грамматика',
      'Офлайн и экспорт',
    ],
    ctaLabel: 'Попробовать',
  },
  {
    tier: 'premium',
    name: 'Месяц',
    price: '$6.99',
    priceNote: 'в месяц',
    features: [
      'Безлимит сканов',
      'Все языки',
      '2–3 примера + грамматика',
      'Офлайн и экспорт',
    ],
    ctaLabel: 'Выбрать месяц',
  },
  {
    tier: 'premium',
    name: 'Год',
    price: '$39.99',
    priceNote: 'в год · $3.33/мес',
    badge: 'Best Value',
    highlighted: true,
    features: [
      'Безлимит сканов',
      'Все языки',
      '2–3 примера + грамматика',
      'Офлайн и экспорт',
      '7 дней бесплатно',
    ],
    ctaLabel: 'Начать 7 дней бесплатно',
  },
];

export function PaywallScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signInWithGoogle } = useAuth();
  const isWeb = Platform.OS === 'web';

  const onSelectPlan = async (plan: Plan) => {
    feedbackTap();
    if (plan.tier === 'free') {
      void alertAsync('Free', 'Это бесплатный тариф — он уже активен.');
      return;
    }

    if (isWeb) {
      // Без аккаунта покупку не к чему привязать (нет reference_id для вебхука) —
      // сначала вход через Google, чтобы подписка встала на аккаунт.
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

    void alertAsync(`Покупка «${plan.name}»`, 'Оплата подключается через RevenueCat.');
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

      {PLANS.map((plan, i) => (
        <Reveal key={plan.name} delay={100 + i * 70}>
          <PlanCard plan={plan} onPress={() => onSelectPlan(plan)} />
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
        <Pressable onPress={() => void alertAsync('Восстановление покупок', 'Подключим вместе с RevenueCat.')} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="primary" style={styles.restore}>
            Восстановить покупки
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
