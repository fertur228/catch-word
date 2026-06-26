/**
 * Настройки / Профиль (спека §5.8).
 * Язык изучения/родной, голос, управление подпиской, восстановление покупок,
 * ссылки Privacy/Terms. Почти всё — заглушки для MVP (Alert).
 */
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: SFSymbol;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed && onPress ? 0.85 : 1 },
      ]}>
      <Icon name={icon} size={20} color={theme.primary} />
      <ThemedText type="default" style={styles.rowLabel}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : null}
      {onPress ? <Icon name="chevron.right" size={14} color={theme.textSecondary} /> : null}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const stub = (t: string) => Alert.alert(t, 'Заглушка для MVP — подключим позже.');

  return (
    <Screen scroll>
      <Section title="ЯЗЫК">
        <Row icon="globe" label="Изучаю" value="English 🇺🇸" onPress={() => stub('Язык изучения')} />
        <Row icon="character.bubble" label="Родной" value="Русский 🇷🇺" onPress={() => stub('Родной язык')} />
        <Row icon="speaker.wave.2.fill" label="Голос / акцент" value="Системный" onPress={() => stub('Выбор голоса')} />
      </Section>

      <Section title="ПОДПИСКА">
        <Row icon="star.fill" label="Текущий тариф" value="Free" />
        <Row icon="sparkles" label="Оформить Premium" onPress={() => router.push('/paywall')} />
        <Row icon="arrow.clockwise" label="Восстановить покупки" onPress={() => stub('Восстановление покупок')} />
      </Section>

      <Section title="О ПРИЛОЖЕНИИ">
        <Row icon="lock.fill" label="Политика конфиденциальности" onPress={() => stub('Privacy Policy')} />
        <Row icon="doc.text" label="Условия использования" onPress={() => stub('Terms of Use')} />
        <Row icon="info.circle" label="Версия" value={Constants.expoConfig?.version ?? '1.0.0'} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  sectionTitle: { paddingHorizontal: Spacing.one, letterSpacing: 0.5 },
  sectionBody: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  rowLabel: { flex: 1 },
});
