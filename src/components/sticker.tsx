/**
 * «Стикер» предмета — вырез «выпрыгивает» из размытого фона (стикер-стайл,
 * фидбэк тестеров 14.07). Содержимое по приоритету:
 *  1. `imageUri` — реальный вырез/фото предмета (спека §5.3): подложка — то же
 *     изображение (или `backdropUri` — исходный кадр) с блюром и затемнением,
 *     поверх — вырез с контурной тенью (на iOS тень идёт по альфе PNG);
 *  2. `category` — минималистичная иконка темы на мягком цветном фоне
 *                  (см. category-icon.ts) — пока фото нет;
 *  3. `symbol`   — произвольная иконка SF Symbols (для декоративных мест).
 * Эмодзи больше не используются — единый чистый стиль.
 */
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryIcon } from '@/lib/category-icon';
import { useCachedImageUri } from '@/lib/image-cache';

const IS_WEB = Platform.OS === 'web';

export function Sticker({
  imageUri,
  backdropUri,
  category,
  symbol,
  tone,
  size = 120,
  style,
}: {
  /** Реальный вырез/фото предмета. Если задан — показываем его. */
  imageUri?: string | null;
  /** Исходный кадр для размытой подложки (Result). Без него — блюрим сам вырез. */
  backdropUri?: string | null;
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
  // На вебе облачный URL подменяется локально закэшированным objectURL
  // (мгновенно при повторных показах); на нативе возвращается как есть.
  const displayUri = useCachedImageUri(imageUri);
  const displayBackdrop = useCachedImageUri(backdropUri ?? imageUri);
  // Блюр масштабируем от размера: на плитке 56px хватает меньшего радиуса.
  const blur = Math.max(8, Math.round(size * 0.14));

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
        },
        style,
      ]}>
      {imageUri ? (
        <>
          {/* Подложка: размытый и затемнённый кадр — предмет остаётся в фокусе.
              Слой обрезан по радиусу отдельно, чтобы не резать внешнюю тень бокса. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
            <Image
              source={displayBackdrop ? { uri: displayBackdrop } : undefined}
              contentFit="cover"
              blurRadius={blur}
              transition={150}
              // scale-up прячет светлую кромку блюра по краям.
              style={[styles.backdrop, IS_WEB && ({ filter: `blur(${blur}px)` } as object)]}
            />
            <View style={[StyleSheet.absoluteFill, styles.dim]} />
          </View>
          <Image
            source={displayUri ? { uri: displayUri } : undefined}
            // «contain» — вырез вписывается целиком; отступ даёт предмету «воздух».
            contentFit="contain"
            transition={150}
            style={[
              styles.cutout,
              { margin: size * 0.1 },
              // Контурная тень: на iOS layer-shadow идёт по альфе PNG,
              // на вебе — CSS drop-shadow по контуру.
              IS_WEB
                ? ({ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))' } as object)
                : styles.cutoutShadow,
            ]}
          />
        </>
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
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transform: [{ scale: 1.25 }],
  },
  dim: { backgroundColor: 'rgba(0,0,0,0.32)' },
  cutout: { flex: 1, alignSelf: 'stretch' },
  cutoutShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
});
