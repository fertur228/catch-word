/**
 * «Стикер» предмета. В MVP это просто эмодзи в скруглённой плашке.
 * Позже здесь будет вырезанное фото предмета (спека §5.3, `[later]`).
 */
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function Sticker({ emoji, size = 120 }: { emoji: string; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
