/**
 * Экран Пейволла (спека §5.7 + тарифы §8).
 *
 * ВАЖНО: все цифры и фичи взяты ровно из спеки §8 (Free / Basic / Premium /
 * Lifetime, 7-дневный триал, годовой Premium — «Best Value»). Реальной оплаты
 * тут нет — кнопки-заглушки. Покупки подключим через RevenueCat следующим
 * слоем (§11, слой 2). Дизайн «CapWords-grade»: герой, переключатель периода
 * с честной экономией, подсветка Premium и мягкая reanimated-анимация.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
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
import type { Plan } from '@/types';

/** Период оплаты для переключателя «Месяц / Год». */
type Period = 'monthly' | 'yearly';

/**
 * Собираем карточки тарифов под выбранный период. Цены — ровно из спеки §8:
 * Free $0; Basic $4.99/мес или $24.99/год; Premium $9.99/мес или $39.99/год.
 * Premium всегда подсвечен; годовой Premium несёт бейдж «Best Value».
 */
function buildPlans(period: Period): Plan[] {
  const yearly = period === 'yearly';
  return [
    {
      tier: 'free',
      name: 'Free',
      price: '$0',
      priceNote: 'Бесплатно навсегда',
      features: [
        '15 сканов всего (или 3/день, 5 дней)',
        '1 язык',
        'Хорошая выдача, 1 пример',
        'Коллекция и просмотр — бесплатно',
      ],
      ctaLabel: 'Текущий тариф',
    },
    {
      tier: 'basic',
      name: 'Basic',
      price: yearly ? '$24.99 / год' : '$4.99 / мес',
      priceNote: yearly ? 'Экономия ~58% против помесячной' : 'Якорный тариф',
      features: ['150 сканов в месяц (хард-кап)', '1–2 языка', '+ произношение', '1 пример на слово'],
      ctaLabel: 'Выбрать Basic',
    },
    {
      tier: 'premium',
      name: 'Premium',
      price: yearly ? '$39.99 / год' : '$9.99 / мес',
      priceNote: yearly ? 'Лучшая цена · 7 дней бесплатно' : '7 дней бесплатно, потом $9.99/мес',
      badge: yearly ? 'Best Value' : undefined,
      highlighted: true,
      features: [
        'Безлимит сканов (мягкий лимит ~1000/мес)',
        'Все языки',
        'Топ-модель: 2–3 примера + грамматика',
        'Офлайн и экспорт',
        '7-дневный триал с честным напоминанием',
      ],
      ctaLabel: yearly ? 'Начать 7 дней бесплатно' : 'Попробовать Premium',
    },
  ];
}

export function PaywallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // По спеке §8 гоним в годовую подписку → она и выбрана по умолчанию.
  const [period, setPeriod] = useState<Period>('yearly');

  const plans = useMemo(() => buildPlans(period), [period]);

  // Заглушка покупки тарифа: реальные платежи — через RevenueCat (§11, слой 2).
  const onSelectPlan = (plan: Plan) => {
    if (plan.tier === 'free') {
      Alert.alert('Free', 'Это бесплатный тариф — он уже активен.');
      return;
    }
    Alert.alert(
      `Покупка «${plan.name}»`,
      'Оплата подключается через RevenueCat — это слой 2 плана сборки (§11). Сейчас это заглушка.',
    );
  };

  // Lifetime $79.99 — разовая покупка Premium навсегда (спека §8).
  const onLifetime = () => {
    Alert.alert(
      'Lifetime — $79.99',
      'Разовая покупка Premium навсегда. Подключим через RevenueCat — слой 2 (§11).',
    );
  };

  const onRestore = () => {
    Alert.alert('Восстановление покупок', 'Заглушка: подключим вместе с RevenueCat — слой 2 (§11).');
  };

  // Честная подпись под переключателем (без обмана про экономию — спека §2/§8).
  const periodNote =
    period === 'yearly'
      ? 'Год дешевле почти 5 месяцев помесячной оплаты.'
      : 'Перейти на годовую можно в любой момент.';

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + Spacing.six }}>
      {/* Герой: большой стикер + обещание + честные «таблетки». */}
      <Reveal delay={0} distance={16} style={styles.hero}>
        <Sticker emoji="🚀" size={104} />
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
            { label: 'Месяц', value: 'monthly' },
            { label: 'Год — выгоднее', value: 'yearly' },
          ]}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.billingNote}>
          {periodNote}
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

      {/* Lifetime — разовая покупка (спека §8). Отдельная «золотая» плашка. */}
      <Reveal delay={380}>
        <View style={[styles.lifetime, { backgroundColor: theme.goldSoft, borderColor: theme.gold }]}>
          <View style={styles.lifetimeHead}>
            <Icon name="infinity" size={22} color={theme.gold} />
            <View style={styles.lifetimeTitles}>
              <ThemedText type="smallBold">Lifetime · $79.99</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Один раз — Premium навсегда, без подписки
              </ThemedText>
            </View>
          </View>
          <Button title="Купить навсегда" variant="secondary" icon="star.fill" onPress={onLifetime} />
        </View>
      </Reveal>

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
          Подписка продлевается автоматически, пока её не отменить в настройках Apple ID. Цены указаны
          для App Store (US).
        </ThemedText>
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

  lifetime: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.four, gap: Spacing.three },
  lifetimeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  lifetimeTitles: { flex: 1, gap: 1 },

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
});
