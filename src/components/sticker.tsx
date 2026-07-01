/**
 * «Стикер» предмета — скруглённая плашка с мягкой тенью. Содержимое по приоритету:
 *  1. `imageUri` — реальное фото/вырез предмета (спека §5.3);
 *  2. `category` — минималистичная иконка темы на мягком цветном фоне
 *                  (см. category-icon.ts) — пока фото нет;
 *  3. `symbol`   — произвольная иконка SF Symbols (для декоративных мест).
 * Эмодзи больше не используются — единый чистый стиль на белом фоне.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryIcon } from '@/lib/category-icon';

export function Sticker({
  imageUri,
  category,
  symbol,
  tone,
  size = 120,
  style,
}: {
  /** Реальный вырез/фото предмета. Если задан — показываем его. */
  imageUri?: string | null;
  /** Тема предмета — выбирает иконку и цвет (когда фото нет). */
  category?: string | null;
  /** Явная иконка (для декоративных мест, например онбординга). */
  symbol?: SFSymbol;
  /** Цвет иконки для режима `symbol` (ключ темы). По умолчанию — вторичный текст. */
  tone?: ThemeColor;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const radius = size * 0.28;

  // Определяем иконку и цвета фона/иконки, когда нет реального фото.
  const ci = categoryIcon(category);
  const iconSymbol = symbol ?? ci.symbol;
  const bg = symbol ? theme.backgroundElement : theme[ci.soft];
  const fg = symbol ? theme[tone ?? 'textSecondary'] : theme[ci.strong];

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: imageUri ? theme.backgroundElement : bg,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          // Отступ вокруг фото, чтобы предмет отошёл от краёв и был виден с воздухом.
          padding: imageUri ? size * 0.12 : 0,
        },
        style,
      ]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: '100%', height: '100%', borderRadius: radius * 0.7 }}
          // «contain» — фото вписывается ЦЕЛИКОМ и авто-масштабируется под любой
          // размер (маленькая плитка / большая карточка), ничего не обрезается.
          contentFit="contain"
          transition={150}
        />
      ) : (
        <Icon name={iconSymbol} size={size * 0.42} color={fg} />
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
