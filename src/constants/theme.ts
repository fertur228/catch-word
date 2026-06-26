/**
 * Палитра, отступы, скругления и шрифты приложения.
 *
 * Цвета заданы для светлой и тёмной темы. Активную палитру отдаёт хук
 * `useTheme()` (src/hooks/use-theme.ts). Любой цвет берём через тему, а не
 * прописываем хардкодом в компонентах — тогда тёмная/светлая тема работают сами.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * ВАЖНО: значения в `Colors` — ВСЕГДА строки-цвета. Тип `ThemeColor` собирается
 * из ключей этого объекта, и `ThemedText`/`ThemedView` подставляют значение прямо
 * в `color`/`backgroundColor`. Если положить сюда массив (пару для градиента) —
 * типы сломаются. Поэтому пары для «градиентов» лежат отдельно — см. `Gradients`.
 */
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
    // --- добавлено для «CapWords-grade» полировки (все значения — строки) ---
    /** Тёплый акцент (коралл) — «поймал слово!», подсветки. */
    accent: '#FF7A59',
    accentSoft: '#FFE9E2',
    /** Второй акцент (бирюза) — статистика, прогресс. */
    accent2: '#12B5A5',
    accent2Soft: '#DCF7F3',
    warning: '#E8920C',
    warningSoft: '#FDF1DD',
    successSoft: '#E2F5EA',
    dangerSoft: '#FDE7E7',
    goldSoft: '#FBF0DC',
    /** Концы «градиента» основного цвета (используются вместе с Gradients). */
    primaryGradientTop: '#6D5DF6',
    primaryGradientBottom: '#4F46E5',
    /** Цвет тени (накладывается с низкой прозрачностью через shadowOpacity). */
    shadow: '#0B1220',
    /** Фон нижней панели вкладок. */
    tabBar: '#FFFFFF',
    /** Заглушка-плейсхолдер (скелетоны загрузки). */
    skeleton: '#ECEEF2',
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
    // --- тёмные парные значения (тот же набор ключей, что и в light) ---
    accent: '#FF8C6B',
    accentSoft: '#3A241C',
    accent2: '#2DD4BF',
    accent2Soft: '#10312D',
    warning: '#F4B23E',
    warningSoft: '#3A2E12',
    successSoft: '#10301F',
    dangerSoft: '#3A1B1B',
    goldSoft: '#332A14',
    primaryGradientTop: '#7C74FF',
    primaryGradientBottom: '#5B54E6',
    shadow: '#000000',
    tabBar: '#0B0B0F',
    skeleton: '#202229',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Пары цветов для «градиентов». Нативного `LinearGradient` в проекте нет,
 * поэтому пары используются как [верх, низ] для имитации (наложение двух View)
 * или просто как согласованная палитра акцентов. Значения — строки.
 */
export const Gradients = {
  light: {
    primary: ['#6D5DF6', '#4F46E5'],
    sunset: ['#FF9A6B', '#FF6F91'],
    mint: ['#34D399', '#12B5A5'],
    gold: ['#FFC53D', '#E8920C'],
  },
  dark: {
    primary: ['#7C74FF', '#5B54E6'],
    sunset: ['#FF8C6B', '#FF6F91'],
    mint: ['#34D399', '#0E9E8F'],
    gold: ['#FFC53D', '#C77C0A'],
  },
} as const;

export type GradientName = keyof typeof Gradients.light & keyof typeof Gradients.dark;

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
  xxl: 32,
  pill: 999,
} as const;

/**
 * Тайминги и пружины для анимаций (react-native-reanimated).
 * Держим в одном месте, чтобы движение по всему приложению было единым.
 *  - `duration`  — для `withTiming` (мс);
 *  - `spring`    — пресеты для `withSpring` (живое, «пружинистое» движение);
 *  - `scalePressed` — насколько сжимать элемент при нажатии.
 */
export const Motion = {
  duration: { fast: 140, base: 240, slow: 420, lazy: 700 },
  /** Пресеты пружин: soft — мягко, bouncy — с отскоком, stiff — быстро и чётко. */
  spring: {
    soft: { damping: 18, stiffness: 160, mass: 1 },
    bouncy: { damping: 12, stiffness: 180, mass: 0.9 },
    stiff: { damping: 26, stiffness: 280, mass: 1 },
  },
  /** Масштаб элемента в нажатом состоянии (микро-интеракция). */
  scalePressed: 0.96,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
