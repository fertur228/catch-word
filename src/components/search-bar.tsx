/**
 * SearchBar — поле поиска со скруглением, иконкой-лупой и кнопкой очистки.
 * Управляемое: значение и обработчик приходят снаружи (value/onChangeText).
 */
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  autoFocus = false,
  style,
}: SearchBarProps) {
  const theme = useTheme();
  const t = useT();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.backgroundElement }, style]}>
      <Icon name="magnifyingglass" size={18} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('Поиск')}
        placeholderTextColor={theme.textSecondary}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        style={[styles.input, { color: theme.text }]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel={t('Очистить')}>
          <Icon name="xmark.circle.fill" size={18} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 44,
    borderRadius: Radius.md,
  },
  input: { flex: 1, fontSize: 16, padding: 0 },
});
