/**
 * Универсальная кнопка с вариантами оформления и опциональной SF-иконкой.
 */
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: SFSymbol;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const theme = useTheme();

  const bg: Record<Variant, string> = {
    primary: theme.primary,
    secondary: theme.backgroundElement,
    danger: theme.danger,
    ghost: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: theme.onPrimary,
    secondary: theme.text,
    danger: '#FFFFFF',
    ghost: theme.text,
  };
  const borderColor = variant === 'ghost' ? theme.border : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg[variant], borderColor, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg[variant]} /> : null}
          <ThemedText type="default" style={[styles.label, { color: fg[variant] }]}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: 14,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  label: { fontWeight: '700' },
});
