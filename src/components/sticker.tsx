/**
 * «Стикер» предмета. Если задан `imageUri` (вырезанное фото предмета —
 * спека §5.3) — показываем его; иначе эмодзи-заглушку (MVP). Скруглённая
 * плашка с мягкой тенью.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/hooks/use-theme';

export function Sticker({
  emoji,
  imageUri,
  size = 120,
  style,
}: {
  emoji: string;
  /** Реальный вырез/фото предмета. Если задан — показываем его вместо эмодзи. */
  imageUri?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const radius = size * 0.28;
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
        style,
      ]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: '100%', height: '100%', borderRadius: radius }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
});
