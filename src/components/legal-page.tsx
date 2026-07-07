/**
 * Простая раскладка юридической страницы (Privacy/Terms): заголовок, дата,
 * секции с абзацами. В каркасе MarketingShell, читаемая колонка.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Container, MarketingShell } from '@/components/marketing';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export interface LegalSection {
  h: string;
  p: string[];
}

export function LegalPage({
  title,
  updated,
  sections,
  topSlot,
}: {
  title: string;
  updated?: string;
  sections: LegalSection[];
  /** Необязательный элемент вверху справа (например, переключатель языка). */
  topSlot?: ReactNode;
}) {
  return (
    <MarketingShell>
      <Container style={styles.wrap}>
        {topSlot ? <View style={styles.topSlot}>{topSlot}</View> : null}
        <ThemedText style={styles.h1}>{title}</ThemedText>
        {updated ? (
          <ThemedText type="small" themeColor="textSecondary">
            {updated}
          </ThemedText>
        ) : null}
        {sections.map((s) => (
          <View key={s.h} style={styles.section}>
            <ThemedText style={styles.h2}>{s.h}</ThemedText>
            {s.p.map((para, i) => (
              <ThemedText key={i} type="default" themeColor="textSecondary" style={styles.para}>
                {para}
              </ThemedText>
            ))}
          </View>
        ))}
      </Container>
    </MarketingShell>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: Spacing.six, gap: Spacing.three, maxWidth: 760 },
  topSlot: { alignSelf: 'flex-end' },
  h1: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5 },
  section: { gap: Spacing.two, marginTop: Spacing.three },
  h2: { fontSize: 20, fontWeight: '700' },
  para: { fontSize: 16, lineHeight: 26 },
});
