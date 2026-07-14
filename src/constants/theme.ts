/**
 * Палитра, отступы, скругления и шрифты приложения.
 *
 * Цвета — по Apple HIG: семантические system colors iOS с точными значениями.
 * Единый акцент — ГРАФИТ (монохром): тёмно-серый в light, светло-серый в dark.
 * Семантические цвета (red/green/orange) сохранены для действий/статусов —
 * так по HIG (цвет = смысл). Любой цвет берём через тему, не хардкодом.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** ВАЖНО: значения — ВСЕГДА строки-цвета. Набор ключей в light и dark совпадает. */
export const Colors = {
  light: {
    text: '#000000', // label
    textSecondary: 'rgba(60,60,67,0.6)', // secondaryLabel
    background: '#FFFFFF', // systemBackground
    backgroundElement: '#F2F2F7', // systemGray6 / grouped
    backgroundSelected: '#E5E5EA', // systemGray5
    card: '#FFFFFF', // secondarySystemGroupedBackground
    border: 'rgba(60,60,67,0.29)', // separator
    /** Акцент — графит (тёмно-серый). Кнопки/активные элементы + белый текст. */
    primary: '#3A3A3C',
    primarySoft: 'rgba(60,60,67,0.10)',
    onPrimary: '#FFFFFF',
    success: '#34C759', // systemGreen
    danger: '#FF3B30', // systemRed
    gold: '#FF9500', // systemOrange
    overlay: 'rgba(0,0,0,0.40)',
    accent: '#3A3A3C', // графит = единый акцент
    accentSoft: 'rgba(60,60,67,0.10)',
    accent2: '#8E8E93', // systemGray (вторичный нейтральный)
    accent2Soft: 'rgba(142,142,147,0.14)',
    /** Приглушённая, но ЧИТАЕМАЯ иконка (таб-бар, пустые звёзды): ≥4.5:1 на фоне. */
    iconMuted: '#6C6C70',
    /** Янтарный, НЕ равен gold: gold занят Premium/стриком, warning — «почти!»/предупреждения. */
    warning: '#D9A400',
    warningSoft: 'rgba(217,164,0,0.14)',
    successSoft: 'rgba(52,199,89,0.14)',
    dangerSoft: 'rgba(255,59,48,0.12)',
    goldSoft: 'rgba(255,149,0,0.14)',
    primaryGradientTop: '#48484A',
    primaryGradientBottom: '#3A3A3C',
    shadow: '#000000',
    tabBar: '#FFFFFF',
    skeleton: '#E9E9EE',
  },
  dark: {
    text: '#FFFFFF', // label
    textSecondary: 'rgba(235,235,245,0.6)', // secondaryLabel
    background: '#000000', // systemBackground (dark)
    backgroundElement: '#1C1C1E', // systemGray6 (dark)
    backgroundSelected: '#2C2C2E', // systemGray5 (dark)
    card: '#1C1C1E', // secondarySystemGroupedBackground (dark)
    border: 'rgba(84,84,88,0.6)', // separator (dark)
    /** Графит в тёмной — СВЕТЛО-серый (контраст на чёрном), текст на нём тёмный. */
    primary: '#EBEBF0',
    primarySoft: 'rgba(235,235,245,0.14)',
    onPrimary: '#000000',
    success: '#30D158',
    danger: '#FF453A',
    gold: '#FF9F0A',
    overlay: 'rgba(0,0,0,0.60)',
    accent: '#EBEBF0',
    accentSoft: 'rgba(235,235,245,0.14)',
    accent2: '#98989F',
    accent2Soft: 'rgba(152,152,159,0.16)',
    /** Тёмная тема: тёмно-серые иконки терялись на чёрном (фидбэк 14.07). */
    iconMuted: '#AEAEB2',
    warning: '#FFD60A',
    warningSoft: 'rgba(255,214,10,0.18)',
    successSoft: 'rgba(48,209,88,0.18)',
    dangerSoft: 'rgba(255,69,58,0.18)',
    goldSoft: 'rgba(255,159,10,0.18)',
    primaryGradientTop: '#EBEBF0',
    primaryGradientBottom: '#C7C7CC',
    shadow: '#000000',
    tabBar: '#0A0A0A',
    skeleton: '#2C2C2E',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Пары для «градиентов» (наложение двух View). Графит/системные тона. */
export const Gradients = {
  light: {
    primary: ['#48484A', '#3A3A3C'],
    sunset: ['#FF9F0A', '#FF375F'],
    mint: ['#34C759', '#30D158'],
    gold: ['#FFCC00', '#FF9500'],
  },
  dark: {
    primary: ['#EBEBF0', '#C7C7CC'],
    sunset: ['#FF9F0A', '#FF375F'],
    mint: ['#30D158', '#34C759'],
    gold: ['#FFD60A', '#FF9F0A'],
  },
} as const;

export type GradientName = keyof typeof Gradients.light & keyof typeof Gradients.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

/** Шкала отступов (в точках). HIG: базовый контентный отступ 16pt, тап-цель ≥44pt. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Шкала скруглений. iOS-списки (inset grouped) ≈ 10pt. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const Motion = {
  duration: { fast: 140, base: 240, slow: 420, lazy: 700, celebration: 900 },
  spring: {
    soft: { damping: 18, stiffness: 160, mass: 1 },
    bouncy: { damping: 12, stiffness: 180, mass: 0.9 },
    stiff: { damping: 26, stiffness: 280, mass: 1 },
    /** Резкая, но чуть упругая — для табов, свайпов, «щелчков». */
    snappy: { damping: 22, stiffness: 240, mass: 1 },
    /** Празднование: сильный overshoot для «взрыва» бейджа/стикера. */
    celebration: { damping: 10, stiffness: 140, mass: 0.9 },
  },
  scalePressed: 0.96,
  /** Шаг «лесенки» появления контента, мс. */
  stagger: 60,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
