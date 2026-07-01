/**
 * Страница тарифов (/pricing) — сравнение Free и Premium + CTA на вход.
 * Веб-оплата идёт через Polar (после входа — экран пейволла в приложении).
 * Цены должны совпадать с реальными продуктами Polar и paywall-screen.tsx.
 */
import { StyleSheet, View } from 'react-native';
import Head from 'expo-router/head';

import { Icon } from '@/components/icon';
import { Container, GoogleButton, MarketingShell, useIsWide } from '@/components/marketing';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const FREE = ['10 сканов всего', 'Коллекция и повторение (SRS)', 'Озвучка слов', 'Квест дня', '1 пара языков'];
const PREMIUM = [
  'Безлимит сканов',
  'Все языковые пары',
  '«Поймай всю сцену» (до 8 слов)',
  'Синхронизация в облаке',
  'Примеры и мнемоники от AI',
  'Приоритетная поддержка',
];

export default function Pricing() {
  const wide = useIsWide();
  return (
    <MarketingShell>
      <Head>
        <title>Тарифы — CatchWord</title>
        <meta name="description" content="Free навсегда или Premium с безлимитом сканов и синхронизацией. Сравните тарифы CatchWord." />
      </Head>

      <Container style={styles.header}>
        <ThemedText style={styles.h1}>Простые тарифы</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.lead}>
          Начни бесплатно. Перейдёшь на Premium, когда захочешь больше.
        </ThemedText>
      </Container>

      <Container style={[styles.plans, wide && styles.row2]}>
        <PlanCard name="Free" price="$0" note="навсегда" features={FREE} />
        <PlanCard name="Premium" price="$6.99" note="в месяц" highlighted features={PREMIUM} />
      </Container>

      <Container style={styles.noteWrap}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Есть тарифы на неделю ($4.99) и год ($39.99 — выгоднее всего). Оформить Premium можно
          прямо в браузере: войди через Google — подписка привяжется к аккаунту и будет доступна
          на всех устройствах.
        </ThemedText>
      </Container>
    </MarketingShell>
  );
}

function PlanCard({
  name,
  price,
  note,
  features,
  highlighted,
}: {
  name: string;
  price: string;
  note: string;
  features: string[];
  highlighted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: highlighted ? theme.primary : theme.border },
        highlighted && styles.cardHi,
      ]}>
      {highlighted ? (
        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Рекомендуем
          </ThemedText>
        </View>
      ) : null}
      <ThemedText type="smallBold" themeColor="textSecondary">
        {name}
      </ThemedText>
      <View style={styles.priceRow}>
        <ThemedText style={styles.price}>{price}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {' '}
          {note}
        </ThemedText>
      </View>
      <View style={styles.features}>
        {features.map((f) => (
          <View key={f} style={styles.feature}>
            <Icon name="checkmark.circle.fill" size={18} color={theme.success} />
            <ThemedText type="default">{f}</ThemedText>
          </View>
        ))}
      </View>
      <View style={styles.cta}>
        <GoogleButton title={highlighted ? 'Войти и оформить' : 'Начать бесплатно'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Spacing.six, gap: Spacing.two, alignItems: 'center' },
  h1: { fontSize: 40, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  lead: { fontSize: 18, lineHeight: 28, textAlign: 'center', maxWidth: 520 },
  plans: { marginTop: Spacing.five, gap: Spacing.three },
  row2: { flexDirection: 'row', alignItems: 'flex-start' },
  card: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.five,
    borderRadius: Radius.xxl,
    borderWidth: 1,
  },
  cardHi: { borderWidth: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.pill },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontSize: 38, fontWeight: '800' },
  features: { gap: Spacing.two },
  feature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cta: { marginTop: Spacing.two },
  noteWrap: { marginTop: Spacing.four },
  note: { textAlign: 'center', maxWidth: 560, alignSelf: 'center' },
});
