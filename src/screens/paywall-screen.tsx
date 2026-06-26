/**
 * Экран Пейволла (спека §5.7 + тарифы §8).
 *
 * ВАЖНО: цифры и фичи взяты ровно из спеки §8. Реальной оплаты тут нет —
 * кнопки-заглушки. Покупки подключим через RevenueCat следующим слоем (§11).
 */
import { Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { PlanCard } from '@/components/plan-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Plan } from '@/types';

// Данные тарифов — из спеки §8 (Free / Basic / Premium).
const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    priceNote: 'Навсегда',
    features: ['15 сканов всего', '1 язык', 'Хорошая выдача, 1 пример', 'Коллекция и просмотр — бесплатно'],
    ctaLabel: 'Текущий тариф',
  },
  {
    tier: 'basic',
    name: 'Basic',
    price: '$4.99/мес · $24.99/год',
    priceNote: 'Якорный тариф',
    features: ['150 сканов в месяц', '1–2 языка', '+ произношение', '1 пример на слово'],
    ctaLabel: 'Выбрать Basic',
  },
  {
    tier: 'premium',
    name: 'Premium',
    price: '$9.99/мес · $39.99/год',
    priceNote: 'Годовой — выгоднее всего · 7 дней бесплатно',
    badge: 'Best Value',
    highlighted: true,
    features: [
      'Безлимит сканов (мягкий лимит ~1000/мес)',
      'Все языки',
      'Топ-модель: 2–3 примера + грамматика',
      'Офлайн и экспорт',
      '7-дневный триал с честным напоминанием',
      'Lifetime — $79.99 (опционально)',
    ],
    ctaLabel: 'Попробовать Premium',
  },
];

export function PaywallScreen() {
  const router = useRouter();

  const onSelect = (plan: Plan) => {
    if (plan.tier === 'free') {
      Alert.alert('Free', 'Это бесплатный тариф — он уже активен.');
      return;
    }
    // Заглушка: реальные покупки подключим через RevenueCat (спека §11, слой 2).
    Alert.alert(
      'Оплата пока не подключена',
      `Здесь будет покупка тарифа «${plan.name}» через RevenueCat — это следующий слой по плану сборки.`,
    );
  };

  return (
    <Screen scroll>
      <ThemedText type="title" style={styles.title}>
        Учи быстрее с Premium
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
        Честно: предупредим до списания, отменить можно в любой момент.
      </ThemedText>

      {PLANS.map((plan) => (
        <PlanCard key={plan.tier} plan={plan} onPress={() => onSelect(plan)} />
      ))}

      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.restore}
        onPress={() => Alert.alert('Восстановление покупок', 'Заглушка: подключим вместе с RevenueCat.')}>
        Восстановить покупки
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 36 },
  subtitle: { marginBottom: Spacing.two },
  restore: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: Spacing.three },
});
