import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { PlanCard } from '@/components/plan-card';
import { Reveal, FadeIn } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import type { Plan } from '@/types';
import { PRIVACY_URL, TERMS_URL } from '@/constants/links';
import { alertAsync } from '@/lib/dialog';
import { isPolarConfigured, redirectToPolar, type PolarProduct } from '@/lib/polar';

type Period = 'weekly' | 'monthly' | 'yearly';

function buildPlans(period: Period): Plan[] {
  const priceMap: Record<Period, string> = {
    weekly:  '$4.99 / нед',
    monthly: '$6.99 / мес',
    yearly:  '$39.99 / год',
  };
  const noteMap: Record<Period, string> = {
    weekly:  'Попробуй одну неделю',
    monthly: 'Отменить можно в любой момент',
    yearly:  'Лучшая цена · 7 дней бесплатно',
  };
  const ctaMap: Record<Period, string> = {
    weekly:  'Попробовать Premium',
    monthly: 'Попробовать Premium',
    yearly:  'Начать 7 дней бесплатно',
  };
  return [
    {
      tier: 'free',
      name: 'Free',
      price: '$0',
      priceNote: 'Бесплатно навсегда',
      features: [
        '10 сканов всего',
        '1 язык',
        'Хорошая выдача, 1 пример',
        'Коллекция и просмотр — бесплатно',
      ],
      ctaLabel: 'Текущий тариф',
    },
    {
      tier: 'premium',
      name: 'Premium',
      price: priceMap[period],
      priceNote: noteMap[period],
      badge: period === 'yearly' ? 'Best Value' : undefined,
      highlighted: true,
      features: [
        'Безлимит сканов',
        'Все языки',
        '2–3 примера + грамматика',
        'Офлайн и экспорт',
        '7-дневный триал (тариф Год)',
      ],
      ctaLabel: ctaMap[period],
    },
  ];
}

export function PaywallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('yearly');

  const plans = useMemo(() => buildPlans(period), [period]);
  const isWeb = Platform.OS === 'web';
  const dodoReady = isWeb && isPolarConfigured();

  const onSelectPlan = (plan: Plan) => {
    if (plan.tier === 'free') {
      void alertAsync('Free', 'Это бесплатный тариф — он уже активен.');
      return;
    }

    if (isWeb) {
      // premium_weekly / premium_monthly / premium_yearly
      const product: PolarProduct = `premium_${period}`;
      if (redirectToPolar(product, user?.email ?? undefined, user?.id ?? undefined)) return;
      void alertAsync('Скоро', 'Оплата подключается — зайди немного позже.');
      return;
    }

    void alertAsync(`Покупка «${plan.name}»`, 'Оплата подключается через RevenueCat.');
  };

  const onRestore = () => {
    void alertAsync('Восстановление покупок', 'Заглушка: подключим вместе с RevenueCat — слой 2 (§11).');
  };

  const periodNote: Record<Period, string> = {
    weekly:  'Короткий sprint — попробуй и реши.',
    monthly: 'Перейти на годовую можно в любой момент.',
    yearly:  'Год дешевле почти 8 недель помесячной оплаты.',
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + Spacing.six }}>
      {/* Герой: большой стикер + обещание + честные «таблетки». */}
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

      {/* Переключатель периода — таблетка-подсветка ездит на пружине. */}
      <Reveal delay={70} style={styles.billing}>
        <SegmentedControl<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { label: 'Неделя', value: 'weekly' },
            { label: 'Месяц', value: 'monthly' },
            { label: 'Год', value: 'yearly' },
          ]}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.billingNote}>
          {periodNote[period]}
        </ThemedText>
      </Reveal>

      <Reveal delay={120}>
        <SectionHeader title="Сравнение тарифов" icon="sparkles" />
      </Reveal>

      {/* Карточки тарифов. Ключ с периодом → анимация повторяется при переключении. */}
      {plans.map((plan, i) => (
        <Reveal key={`${period}-${plan.tier}`} delay={150 + i * 70}>
          <PlanCard plan={plan} onPress={() => onSelectPlan(plan)} />
        </Reveal>
      ))}

      {/* Честная строка: напоминание ДО списания (наша отстройка, спека §2/§5.7). */}
      <Reveal delay={440}>
        <View style={[styles.honest, { backgroundColor: theme.accent2Soft }]}>
          <Icon name="bell.fill" size={18} color={theme.accent2} />
          <ThemedText type="small" style={styles.honestText}>
            Честно: напомним за 24 часа до конца бесплатного периода. Отменить можно в любой момент —
            без скрытых списаний.
          </ThemedText>
        </View>
      </Reveal>

      {/* Восстановление покупок + сухой юридический хвост. */}
      <FadeIn delay={500} style={styles.footer}>
        <Pressable onPress={onRestore} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="primary" style={styles.restore}>
            Восстановить покупки
          </ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
          Подписка с автопродлением. Оплата спишется с Apple ID при подтверждении. Продлевается
          автоматически, пока не отменить минимум за 24 часа до конца периода — в настройках Apple ID.
          Цены для App Store (US).
        </ThemedText>
        <View style={styles.legalLinks}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
            <ThemedText type="small" themeColor="primary" style={styles.legalLink}>
              Условия (EULA)
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            ·
          </ThemedText>
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
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.one },

  billing: { gap: Spacing.two },
  billingNote: { textAlign: 'center' },

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
