import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Текст приложения. Типо-шкала — по Apple HIG (iOS Dynamic Type, дефолтный
 * размер): Large Title 34 / Title 2 22 / Body 17 / Subheadline 15 / Footnote 13,
 * с системным leading. Шрифт — системный (San Francisco на Apple).
 */
export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />
  );
}

const styles = StyleSheet.create({
  // Body (17/22)
  default: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  // Large Title (34/41, Bold)
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  // Title 2 (22/28, Bold)
  subtitle: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  // Subheadline (15/20)
  small: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  smallBold: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  // Ссылки — Subheadline
  link: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  linkPrimary: { fontSize: 15, lineHeight: 20, fontWeight: '400', color: '#3c87f7' },
  // Footnote-моно
  code: { fontFamily: Fonts.mono, fontWeight: Platform.select({ android: '700' }) ?? '500', fontSize: 13 },
});
