/**
 * Включён ли в системе «Уменьшение движения» (Settings → Accessibility →
 * Motion). При true тяжёлые зацикленные анимации (сканирующий луч, пульсация)
 * стоит отключать — и для людей, кого укачивает, и чтобы не словить reject.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
