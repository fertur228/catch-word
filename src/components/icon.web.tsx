/**
 * Веб-иконки — С НУЛЯ на инлайновых SVG (а НЕ на иконочных шрифтах).
 *
 * Почему так: @expo/vector-icons на вебе зависит от загрузки .ttf-шрифта —
 * это даёт мигание/«квадратики-тофу» и непредсказуемый вид. Здесь каждая иконка
 * — это чистый <svg> (стиль Lucide: viewBox 24×24, обводка 2px, круглые концы),
 * который рисует сам react-dom. Ничего грузить не нужно → иконки не ломаются.
 *
 * API идентичен `icon.tsx` (name/size/color), поэтому весь UI (Button/Pill/
 * Sticker/экраны) работает без изменений. Неизвестное имя → нейтральная точка.
 *
 * Заметка по рендеру: в `.web.tsx` JSX рендерится react-dom, поэтому интринсики
 * <svg>/<path>/... валидны (типы — из @types/react). Внутри RN-дерева <svg>
 * живёт как обычный DOM-элемент (View → div на вебе).
 */
import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { useTheme } from '@/hooks/use-theme';

type Draw = (c: string) => ReactNode;

/** Белый для «внутренних» глифов в залитых бейджах (как у SF filled-символов). */
const ON = '#FFFFFF';

/**
 * Реестр: имя SF-символа → отрисовка SVG-содержимого.
 * Большинство — обводкой (наследуют stroke/strokeWidth от <svg>). У залитых
 * форм явно ставим fill={c} stroke="none". У бейджей-кружков внутренний глиф — ON.
 */
const ICONS: Record<string, Draw> = {
  // ---------- Навигация / базовые ----------
  'arrow.right': () => (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  'chevron.left': () => <path d="m15 18-6-6 6-6" />,
  'chevron.right': () => <path d="m9 18 6-6-6-6" />,
  checkmark: () => <path d="M20 6 9 17l-5-5" />,
  xmark: () => (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  circle: () => <circle cx="12" cy="12" r="9" />,

  // ---------- Стрелки-циклы ----------
  'arrow.clockwise': () => (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  'arrow.counterclockwise': () => (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  'arrow.triangle.2.circlepath': () => (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),

  // ---------- Действия / статусы ----------
  'bell.fill': (c) => (
    <>
      <path
        d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
        fill={c}
        stroke={c}
      />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" fill="none" stroke={ON} />
    </>
  ),
  bolt: () => (
    <path d="M13 2 4.09 12.97a1 1 0 0 0 .77 1.63H11l-1 7.4 8.91-10.97a1 1 0 0 0-.77-1.63H12z" />
  ),
  'bolt.fill': (c) => (
    <path
      d="M13 2 4.09 12.97a1 1 0 0 0 .77 1.63H11l-1 7.4 8.91-10.97a1 1 0 0 0-.77-1.63H12z"
      fill={c}
      stroke={c}
    />
  ),
  'checkmark.circle.fill': (c) => (
    <>
      <circle cx="12" cy="12" r="10" fill={c} stroke="none" />
      <path d="m8 12 2.5 2.5L16 9" fill="none" stroke={ON} />
    </>
  ),
  'checkmark.seal.fill': (c) => (
    <>
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill={c}
        stroke={c}
      />
      <path d="m9 12 2 2 4-4" fill="none" stroke={ON} />
    </>
  ),
  checklist: () => (
    <>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </>
  ),
  'exclamationmark.triangle.fill': (c) => (
    <>
      <path
        d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
        fill={c}
        stroke={c}
      />
      <path d="M12 9v4" fill="none" stroke={ON} />
      <path d="M12 17h.01" fill="none" stroke={ON} />
    </>
  ),
  'info.circle.fill': (c) => (
    <>
      <circle cx="12" cy="12" r="10" fill={c} stroke="none" />
      <path d="M12 11v5" fill="none" stroke={ON} />
      <path d="M12 8h.01" fill="none" stroke={ON} />
    </>
  ),
  'xmark.circle.fill': (c) => (
    <>
      <circle cx="12" cy="12" r="10" fill={c} stroke="none" />
      <path d="m15 9-6 6" fill="none" stroke={ON} />
      <path d="m9 9 6 6" fill="none" stroke={ON} />
    </>
  ),
  pencil: () => (
    <>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </>
  ),
  trash: () => (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  'trash.fill': (c) => (
    <>
      <path
        d="M5 6h14l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"
        fill={c}
        stroke={c}
      />
      <path d="M3 6h18" fill="none" stroke={c} />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" fill="none" stroke={c} />
      <path d="M10 11v6" fill="none" stroke={ON} />
      <path d="M14 11v6" fill="none" stroke={ON} />
    </>
  ),

  // ---------- Камера / распознавание ----------
  'camera.fill': (c) => (
    <>
      <path
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"
        fill={c}
        stroke={c}
      />
      <circle cx="12" cy="13" r="3.2" fill="none" stroke={ON} />
    </>
  ),
  viewfinder: () => (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'square.grid.2x2': () => (
    <>
      <rect width="7" height="7" x="3" y="3" rx="1.5" />
      <rect width="7" height="7" x="14" y="3" rx="1.5" />
      <rect width="7" height="7" x="14" y="14" rx="1.5" />
      <rect width="7" height="7" x="3" y="14" rx="1.5" />
    </>
  ),
  'square.grid.2x2.fill': (c) => (
    <>
      <rect width="7" height="7" x="3" y="3" rx="1.5" fill={c} stroke={c} />
      <rect width="7" height="7" x="14" y="3" rx="1.5" fill={c} stroke={c} />
      <rect width="7" height="7" x="14" y="14" rx="1.5" fill={c} stroke={c} />
      <rect width="7" height="7" x="3" y="14" rx="1.5" fill={c} stroke={c} />
    </>
  ),
  target: () => (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),

  // ---------- Озвучка / медиа ----------
  'play.fill': (c) => <polygon points="6 3 20 12 6 21 6 3" fill={c} stroke={c} />,
  'speaker.wave.2.fill': (c) => (
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={c} stroke={c} />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke={c} />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" fill="none" stroke={c} />
    </>
  ),
  waveform: () => (
    <>
      <path d="M2 13v-2" />
      <path d="M6 17V7" />
      <path d="M10 19V5" />
      <path d="M14 17V7" />
      <path d="M18 15V9" />
      <path d="M22 13v-2" />
    </>
  ),
  'tortoise.fill': (c) => (
    <>
      <path
        d="M11 17a6 6 0 1 0-6-6h2a4 4 0 1 1 4 4z"
        fill={c}
        stroke={c}
      />
      <path d="M14.5 12.5 17 10" fill="none" stroke={c} />
      <path d="M17 10h3a2 2 0 0 1 0 4H5" fill="none" stroke={c} />
      <path d="M5 14v2" fill="none" stroke={c} />
      <path d="M9 17v1" fill="none" stroke={c} />
    </>
  ),

  // ---------- Прочее интерфейсное ----------
  calendar: () => (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  'clock.fill': (c) => (
    <>
      <circle cx="12" cy="12" r="10" fill={c} stroke={c} />
      <polyline points="12 7 12 12 15.5 14" fill="none" stroke={ON} />
    </>
  ),
  'flame.fill': (c) => (
    <path
      d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
      fill={c}
      stroke={c}
    />
  ),
  'eye.fill': (c) => (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" fill={c} stroke={c} />
      <circle cx="12" cy="12" r="3" fill="#fff" stroke="#fff" />
    </>
  ),
  'trophy.fill': (c) => (
    <>
      <path
        d="M6 9a6 6 0 0 0 12 0V4H6v5zM6 4H4a2 2 0 0 0 2 2m12-2h2a2 2 0 0 1-2 2"
        fill={c}
        stroke={c}
      />
      <path d="M10 15h4M12 15v3M9 21h6M10.5 21v-3h3v3" stroke={c} />
    </>
  ),
  globe: () => (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  'gearshape.fill': (c) => (
    <>
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        fill={c}
        stroke={c}
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke={ON} />
    </>
  ),
  'gift.fill': (c) => (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" fill={c} stroke={c} />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7z" fill={c} stroke={c} />
      <path d="M12 8v13" fill="none" stroke={ON} />
      <path
        d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 12 5.5 12 8c0-2.5 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"
        fill="none"
        stroke={c}
      />
    </>
  ),
  'graduationcap.fill': (c) => (
    <>
      <path d="M22 10 12 5 2 10l10 5z" fill={c} stroke={c} />
      <path d="M6 12v5c3 2.5 9 2.5 12 0v-5" fill="none" stroke={c} />
      <path d="M22 10v6" fill="none" stroke={c} />
    </>
  ),
  infinity: () => (
    <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
  ),
  'lightbulb.fill': (c) => (
    <>
      <path
        d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"
        fill={c}
        stroke={c}
      />
      <path d="M9 18h6" fill="none" stroke={c} />
      <path d="M10 22h4" fill="none" stroke={c} />
    </>
  ),
  'lock.fill': (c) => (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" fill={c} stroke={c} />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke={c} />
      <path d="M12 15v3" fill="none" stroke={ON} />
    </>
  ),
  magnifyingglass: () => (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  'note.text': () => (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  'doc.text.fill': (c) => (
    <>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        fill={c}
        stroke={c}
      />
      <path d="M14 2v6h6" fill="none" stroke={ON} />
      <path d="M9 13h6" fill="none" stroke={ON} />
      <path d="M9 17h4" fill="none" stroke={ON} />
    </>
  ),
  'envelope.fill': (c) => (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" fill={c} stroke={c} />
      <path d="m4 7 7.07 5a2 2 0 0 0 1.86 0L20 7" fill="none" stroke={ON} />
    </>
  ),
  'creditcard.fill': (c) => (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" fill={c} stroke={c} />
      <path d="M2 10h20" fill="none" stroke={ON} />
      <path d="M6 15h4" fill="none" stroke={ON} />
    </>
  ),
  sparkles: (c) => (
    <>
      <path
        d="M9.94 14.06A2 2 0 0 0 8.5 12.62l-4.6-1.18a.5.5 0 0 1 0-.96l4.6-1.18A2 2 0 0 0 9.94 7.9l1.18-4.6a.5.5 0 0 1 .96 0l1.18 4.6a2 2 0 0 0 1.44 1.44l4.6 1.18a.5.5 0 0 1 0 .96l-4.6 1.18a2 2 0 0 0-1.44 1.44l-1.18 4.6a.5.5 0 0 1-.96 0z"
        fill={c}
        stroke={c}
      />
      <path d="M19 4v3" fill="none" stroke={c} />
      <path d="M20.5 5.5h-3" fill="none" stroke={c} />
    </>
  ),
  star: () => (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  'star.fill': (c) => (
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      fill={c}
      stroke={c}
    />
  ),
  'square.and.arrow.up': () => (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <path d="M12 2v14" />
    </>
  ),
  'rectangle.portrait.and.arrow.right': () => (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <path d="M21 12H9" />
    </>
  ),
  'rectangle.stack.fill': (c) => (
    <>
      <path
        d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
        fill={c}
        stroke={c}
      />
      <path d="m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5" fill="none" stroke={c} />
      <path d="m22 17-9.17 4.16a2 2 0 0 1-1.66 0L2 17" fill="none" stroke={c} />
    </>
  ),
  'text.bubble.fill': (c) => (
    <>
      <path
        d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4z"
        fill={c}
        stroke={c}
      />
      <path d="M8 8h8" fill="none" stroke={ON} />
      <path d="M8 11.5h5" fill="none" stroke={ON} />
    </>
  ),
  'bubble.left.and.bubble.right.fill': (c) => (
    <>
      <path
        d="M2 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H6l-4 3z"
        fill={c}
        stroke={c}
      />
      <path
        d="M16 9h4a2 2 0 0 1 2 2v5l-4-3h-2a2 2 0 0 1-2-2"
        fill={c}
        stroke={c}
      />
    </>
  ),

  // ---------- Аккаунт ----------
  'person.crop.circle.fill': (c) => (
    <>
      <circle cx="12" cy="12" r="10" fill={c} stroke={c} />
      <circle cx="12" cy="10" r="3.2" fill="none" stroke={ON} />
      <path d="M6.5 19a6 6 0 0 1 11 0" fill="none" stroke={ON} />
    </>
  ),
  'person.crop.circle.badge.plus': () => (
    <>
      <path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </>
  ),

  // ---------- Категории предметов ----------
  'car.fill': (c) => (
    <>
      <path
        d="M5 17h14a1 1 0 0 0 1-1v-3c0-.9-.7-1.7-1.5-1.9L17 6.6C16.7 5.6 15.8 5 14.8 5H9.2c-1 0-1.9.6-2.2 1.6L5.5 11.1C4.7 11.3 4 12.1 4 13v3a1 1 0 0 0 1 1Z"
        fill={c}
        stroke={c}
      />
      <circle cx="7.5" cy="16.5" r="1.8" fill={ON} stroke="none" />
      <circle cx="16.5" cy="16.5" r="1.8" fill={ON} stroke="none" />
    </>
  ),
  'cup.and.saucer.fill': (c) => (
    <>
      <path
        d="M4 8h12a1 1 0 0 1 1 1v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1Z"
        fill={c}
        stroke={c}
      />
      <path d="M17 9h1a3 3 0 0 1 0 6h-1" fill="none" stroke={c} />
      <path d="M3 21h14" fill="none" stroke={c} />
      <path d="M8 2v3" fill="none" stroke={c} />
      <path d="M12 2v3" fill="none" stroke={c} />
    </>
  ),
  'fork.knife': () => (
    <>
      <path d="M4 3v6a2 2 0 0 0 4 0V3" />
      <path d="M6 9v12" />
      <path d="M17 3c-1.7 0-3 1.8-3 4s1.3 4 3 4" />
      <path d="M17 3v18" />
    </>
  ),
  'house.fill': (c) => (
    <>
      <path
        d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        fill={c}
        stroke={c}
      />
      <path d="M9.5 21v-6h5v6" fill="none" stroke={ON} />
    </>
  ),
  laptopcomputer: () => (
    <>
      <rect width="16" height="11" x="4" y="5" rx="2" />
      <path d="M2 20h20" />
    </>
  ),
  'leaf.fill': (c) => (
    <>
      <path
        d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
        fill={c}
        stroke={c}
      />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" fill="none" stroke={c} />
    </>
  ),
  'pawprint.fill': (c) => (
    <>
      <circle cx="11" cy="4" r="2" fill={c} stroke={c} />
      <circle cx="18" cy="8" r="2" fill={c} stroke={c} />
      <circle cx="20" cy="16" r="2" fill={c} stroke={c} />
      <path
        d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"
        fill={c}
        stroke={c}
      />
    </>
  ),
  'shippingbox.fill': (c) => (
    <>
      <path
        d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
        fill={c}
        stroke={c}
      />
      <path d="m3.3 7 8.7 5 8.7-5" fill="none" stroke={ON} />
      <path d="M12 22V12" fill="none" stroke={ON} />
    </>
  ),
  'sofa.fill': (c) => (
    <>
      <path
        d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"
        fill="none"
        stroke={c}
      />
      <path
        d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
        fill={c}
        stroke={c}
      />
      <path d="M5 21v-2" fill="none" stroke={c} />
      <path d="M19 21v-2" fill="none" stroke={c} />
    </>
  ),
  'tag.fill': (c) => (
    <>
      <path
        d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"
        fill={c}
        stroke={c}
      />
      <circle cx="7.5" cy="7.5" r="1.3" fill={ON} stroke="none" />
    </>
  ),
  'tshirt.fill': (c) => (
    <path
      d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"
      fill={c}
      stroke={c}
    />
  ),
};

/** Неизвестное имя → нейтральная точка (никогда не падаем и не оставляем дыру). */
const FALLBACK: Draw = (c) => <circle cx="12" cy="12" r="4" fill={c} stroke={c} />;

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: SFSymbol;
  size?: number;
  color?: ColorValue;
}) {
  const theme = useTheme();
  const tint = (color as string) ?? theme.text;
  const draw = ICONS[name as unknown as string] ?? FALLBACK;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tint}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden>
      {draw(tint)}
    </svg>
  );
}
