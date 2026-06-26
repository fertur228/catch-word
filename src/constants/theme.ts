/**
 * Палитра, отступы, скругления и шрифты приложения.
 *
 * Цвета заданы для светлой и тёмной темы. Активную палитру отдаёт хук
 * `useTheme()` (src/hooks/use-theme.ts). Любой цвет берём через тему, а не
 * прописываем хардкодом в компонентах — тогда тёмная/светлая тема работают сами.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#5B6168',
    background: '#FFFFFF',
    backgroundElement: '#F1F2F5',
    backgroundSelected: '#E4E6EB',
    card: '#FFFFFF',
    border: '#E3E5EA',
    primary: '#4F46E5',
    primarySoft: '#EEF0FF',
    onPrimary: '#FFFFFF',
    success: '#1F9D55',
    danger: '#E5484D',
    gold: '#C77C0A',
    overlay: 'rgba(0,0,0,0.45)',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    background: '#0B0B0F',
    backgroundElement: '#17181D',
    backgroundSelected: '#23252B',
    card: '#16171C',
    border: '#2A2C33',
    primary: '#6366F1',
    primarySoft: '#1E1B3A',
    onPrimary: '#FFFFFF',
    success: '#34D399',
    danger: '#FF6B6B',
    gold: '#FFC53D',
    overlay: 'rgba(0,0,0,0.55)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Шкала отступов (в точках). Используй вместо «магических» чисел. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Шкала скруглений углов. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
