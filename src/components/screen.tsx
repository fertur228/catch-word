/**
 * Обёртка экрана: тематический фон + удобные отступы + опциональный скролл.
 * Экраны со Stack-заголовком уже получают безопасную зону сверху, поэтому
 * тут мы заботимся только о горизонтальных/вертикальных отступах контента.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

interface ScreenProps {
  children: ReactNode;
  /** Сделать контент прокручиваемым. */
  scroll?: boolean;
  /** Горизонтальные поля по краям (по умолчанию да). */
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = false, padded = true, contentStyle }: ScreenProps) {
  const pad = padded ? styles.padded : null;

  if (scroll) {
    return (
      <ThemedView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, pad, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.flex, pad, contentStyle]}>{children}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: Spacing.four },
  scrollContent: { paddingVertical: Spacing.four, gap: Spacing.three, flexGrow: 1 },
});
