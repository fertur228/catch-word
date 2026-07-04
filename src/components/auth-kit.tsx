/**
 * Общие элементы экранов авторизации (вход/регистрация/подтверждение) —
 * поле с подписью и основная синяя кнопка. Стиль близок к примеру Qustar,
 * но темизирован (light/dark) и в фирменном синем TakeWord.
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

/** Фирменный синий из логотипа — акцент кнопок и ссылок на экранах входа. */
export const BRAND_BLUE = '#1678B2';

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

/** Основная кнопка действия (синяя, во всю ширину). */
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
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: BRAND_BLUE, opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.btnLabel}>{title}</Text>
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
  btnLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
