/**
 * Карточка тарифа для экрана Пейволла. Цифры/фичи приходят из props
 * (см. экран PaywallScreen — данные взяты из спеки §8).
 */
import { StyleSheet, View } from 'react-native';

import { Shine } from '@/components/anim/sparkle';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Plan } from '@/types';

export function PlanCard({ plan, onPress, loading }: { plan: Plan; onPress: () => void; loading?: boolean }) {
  const theme = useTheme();
  const highlighted = !!plan.highlighted;

  return (
    <View
      style={[
        styles.card,
        highlighted ? styles.cardHighlighted : null,
        {
          backgroundColor: highlighted ? theme.primarySoft : theme.card,
          borderColor: highlighted ? theme.primary : theme.border,
          borderWidth: highlighted ? 2 : 1,
        },
      ]}>
      {/* Выделенный тариф ловит мягкий световой блик — притягивает взгляд. */}
      {highlighted ? <Shine loop width={260} /> : null}
      {plan.badge ? (
        <View style={[styles.badge, { backgroundColor: theme.gold }]}>
          <ThemedText type="smallBold" style={styles.badgeText}>
            {plan.badge}
          </ThemedText>
        </View>
      ) : null}

      <ThemedText type="subtitle">{plan.name}</ThemedText>
      <ThemedText type="default" style={styles.price}>
        {plan.price}
      </ThemedText>
      {plan.priceNote ? (
        <ThemedText type="small" themeColor="textSecondary">
          {plan.priceNote}
        </ThemedText>
      ) : null}

      <View style={styles.features}>
        {plan.features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Icon name="checkmark.circle.fill" size={18} color={theme.success} />
            <ThemedText type="small" style={styles.featureText}>
              {f}
            </ThemedText>
          </View>
        ))}
      </View>

      <Button title={plan.ctaLabel} onPress={onPress} loading={loading} variant={highlighted ? 'primary' : 'secondary'} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  // Выделенный тариф обрезает блик по скруглению.
  cardHighlighted: { overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  badgeText: { color: '#FFFFFF' },
  price: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  features: { gap: Spacing.two, marginVertical: Spacing.two },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  featureText: { flex: 1 },
});
