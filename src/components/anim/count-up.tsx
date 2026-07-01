/**
 * Плавный счётчик 0→N («одометр»). Число меняется через requestAnimationFrame —
 * это НЕ покадровый трансформ, а редкое обновление текста, поэтому дёшево и не
 * грузит UI-поток. При «Reduce Motion» сразу показываем финальное значение.
 *
 *   const n = useCountUp(stats.mastered);        // хук — своё оформление текста
 *   <CountUp value={42} type="title" />          // готовый ThemedText
 */
import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import type { ThemeColor } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** Анимирует целое число от 0 (или предыдущего значения) к `value`. */
export function useCountUp(value: number, duration = 900): number {
  const reduce = useReduceMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setDisplay(value);
      return;
    }
    startRef.current = 0;
    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / duration);
      setDisplay(Math.round(from + delta * easeOutCubic(p)));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value; // следующий заход стартует с текущей цели
    };
  }, [value, duration, reduce]);

  return display;
}

export function CountUp({
  value,
  duration,
  type = 'default',
  themeColor,
  style,
}: {
  value: number;
  duration?: number;
  type?: React.ComponentProps<typeof ThemedText>['type'];
  themeColor?: ThemeColor;
  style?: React.ComponentProps<typeof ThemedText>['style'];
}) {
  const n = useCountUp(value, duration);
  return (
    <ThemedText type={type} themeColor={themeColor} style={style}>
      {n}
    </ThemedText>
  );
}
