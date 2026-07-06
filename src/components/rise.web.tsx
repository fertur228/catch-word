/**
 * Rise (ВЕБ) — появление контента при въезде в вьюпорт (reveal-on-scroll),
 * как в брифе лендинга. Через IntersectionObserver + CSS-переход (react-native-web
 * поддерживает transition* как web-стили). Один раз сработал — больше не прячем.
 */
import { useEffect, useRef, useState } from 'react';
import { View, type ViewStyle } from 'react-native';

export function Rise({
  children,
  delay = 0,
  y = 26,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const ref = useRef<View | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current as unknown as Element | null;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <View
      ref={ref}
      style={[
        style as ViewStyle,
        {
          opacity: shown ? 1 : 0,
          transform: [{ translateY: shown ? 0 : y }],
          // react-native-web прокидывает transition* в CSS.
          transitionProperty: 'opacity, transform',
          transitionDuration: '680ms',
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          transitionDelay: `${delay}ms`,
        } as unknown as ViewStyle,
      ]}>
      {children}
    </View>
  );
}
