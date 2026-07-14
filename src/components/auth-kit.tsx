/**
 * Общие элементы экранов авторизации (вход/регистрация/подтверждение) —
 * поле с подписью и основная кнопка. Стиль близок к примеру Qustar, но в
 * графитовом акценте приложения (фидбэк тестеров 14.07: синий онбординг
 * конфликтовал с ч/б продуктом — бренд теперь монохромный везде).
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Поле ввода с подписью сверху (Email, Пароль, Имя, …). */
export function AuthField({ label, style, ...input }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
          style,
        ]}
        {...input}
      />
    </View>
  );
}

/** Основная кнопка действия (графит, во всю ширину). */
export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.primary, opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={theme.onPrimary} />
      ) : (
        <Text style={[styles.btnLabel, { color: theme.onPrimary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  label: { marginLeft: 2 },
  input: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
  },
  btn: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { fontSize: 17, fontWeight: '700' },
});
