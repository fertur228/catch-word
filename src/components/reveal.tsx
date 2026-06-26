/**
 * Reveal / FadeIn — крошечные обёртки для «появления» контента с анимацией
 * (react-native-reanimated). Дают единое мягкое движение по всему приложению:
 * блоки выезжают снизу с затуханием, можно ставить задержку (stagger).
 *
 * Пример «лесенки»:
 *   <Reveal delay={0}><Header/></Reveal>
 *   <Reveal delay={60}><Card/></Reveal>
 *   <Reveal delay={120}><Card/></Reveal>
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn as RFadeIn, FadeInDown } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

interface RevealProps {
  children: ReactNode;
  /** Задержка перед появлением, мс (для эффекта «лесенки»). */
  delay?: number;
  /** На сколько пикселей выезжать снизу. 0 — чистое затухание без сдвига. */
  distance?: number;
  /** Длительность, мс. */
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/** Появление снизу-вверх с затуханием. */
export function Reveal({
  children,
  delay = 0,
  distance = 12,
  duration = Motion.duration.base,
  style,
}: RevealProps) {
  const entering =
    distance > 0
      ? FadeInDown.delay(delay).duration(duration)
      : RFadeIn.delay(delay).duration(duration);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/** Чистое затухание (без сдвига) — синоним Reveal с distance=0. */
export function FadeIn({ children, delay = 0, duration = Motion.duration.base, style }: Omit<RevealProps, 'distance'>) {
  return (
    <Reveal delay={delay} distance={0} duration={duration} style={style}>
      {children}
    </Reveal>
  );
}
