/**
 * Демо кор-фичи на лендинге (ВЕБ): наводишь камеру → слово уходит в коллекцию.
 * Реальный <video> через react-dom: autoplay + muted + loop + playsInline — ведёт
 * себя как GIF, но во много раз легче. `muted` форсируем через ref (React не
 * выставляет его надёжно, а без muted автоплей в браузерах запрещён).
 *
 * Портретная запись экрана → узкий контейнер по центру (вид «телефон»).
 */
import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

export function VideoDemo({
  src,
  poster,
  maxWidth = 340,
}: {
  src: string;
  poster?: string;
  label?: string;
  maxWidth?: number;
}) {
  const video = createElement('video', {
    src,
    poster,
    autoPlay: true,
    loop: true,
    playsInline: true,
    controls: false,
    preload: 'metadata',
    // Форсируем muted + пробуем стартовать (некоторые браузеры требуют явный play).
    ref: (el: HTMLVideoElement | null) => {
      if (!el) return;
      el.muted = true;
      el.defaultMuted = true;
      const p = el.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    },
    style: { display: 'block', width: '100%', height: 'auto' },
  });

  return <View style={[styles.wrap, { maxWidth }, FLOAT]}>{video}</View>;
}

// Лёгкое бесконечное «дыхание» (float) — react-native-web понимает animationKeyframes.
const FLOAT = {
  animationKeyframes: [
    { '0%': { transform: [{ translateY: 0 }] }, '50%': { transform: [{ translateY: -8 }] }, '100%': { transform: [{ translateY: 0 }] } },
  ],
  animationDuration: '5s',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'ease-in-out',
} as never;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'center',
    marginTop: 22,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#161619',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 24 },
  },
});
