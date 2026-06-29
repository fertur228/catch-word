/**
 * Веб-вариант иконок. SF Symbols (`expo-symbols`) в браузере не рендерятся,
 * поэтому маппим имена SF-символов на @expo/vector-icons (Ionicons /
 * MaterialCommunityIcons) — они работают на вебе через иконочные шрифты.
 *
 * API идентичен icon.tsx, поэтому весь UI (Button/Pill/Sticker/экраны) работает
 * без изменений. Неизвестный символ → нейтральный дефолт (не падаем).
 */
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/use-theme';

type Glyph = { set: 'ion' | 'mci'; name: string };

/** SF Symbol → ближайшая иконка @expo/vector-icons (что реально используется в коде). */
const MAP: Record<string, Glyph> = {
  // --- интерфейсные ---
  'arrow.right': { set: 'ion', name: 'arrow-forward' },
  'bell.fill': { set: 'ion', name: 'notifications' },
  'bubble.left.and.bubble.right.fill': { set: 'ion', name: 'chatbubbles' },
  calendar: { set: 'ion', name: 'calendar-outline' },
  'camera.fill': { set: 'ion', name: 'camera' },
  checkmark: { set: 'ion', name: 'checkmark' },
  'checkmark.circle.fill': { set: 'ion', name: 'checkmark-circle' },
  'checkmark.seal.fill': { set: 'mci', name: 'check-decagram' },
  'chevron.left': { set: 'ion', name: 'chevron-back' },
  'chevron.right': { set: 'ion', name: 'chevron-forward' },
  clock: { set: 'ion', name: 'time-outline' },
  'clock.fill': { set: 'ion', name: 'time' },
  'exclamationmark.triangle.fill': { set: 'ion', name: 'warning' },
  'flame.fill': { set: 'ion', name: 'flame' },
  'gearshape.fill': { set: 'ion', name: 'settings' },
  globe: { set: 'ion', name: 'globe-outline' },
  'graduationcap.fill': { set: 'ion', name: 'school' },
  infinity: { set: 'ion', name: 'infinite' },
  'info.circle.fill': { set: 'ion', name: 'information-circle' },
  'lightbulb.fill': { set: 'ion', name: 'bulb' },
  'lock.fill': { set: 'ion', name: 'lock-closed' },
  magnifyingglass: { set: 'ion', name: 'search' },
  'note.text': { set: 'ion', name: 'document-text-outline' },
  pencil: { set: 'ion', name: 'pencil' },
  'play.fill': { set: 'ion', name: 'play' },
  sparkles: { set: 'ion', name: 'sparkles' },
  'square.grid.2x2.fill': { set: 'ion', name: 'grid' },
  'square.grid.2x2': { set: 'ion', name: 'grid-outline' },
  'text.bubble.fill': { set: 'ion', name: 'chatbubble-ellipses' },
  target: { set: 'mci', name: 'target' },
  viewfinder: { set: 'mci', name: 'image-filter-center-focus' },
  'xmark.circle.fill': { set: 'ion', name: 'close-circle' },
  xmark: { set: 'ion', name: 'close' },
  bolt: { set: 'ion', name: 'flash-outline' },
  'bolt.fill': { set: 'ion', name: 'flash' },
  trash: { set: 'ion', name: 'trash-outline' },
  'arrow.clockwise': { set: 'ion', name: 'refresh' },
  'speaker.wave.2.fill': { set: 'ion', name: 'volume-high' },
  'tortoise.fill': { set: 'mci', name: 'tortoise' },
  star: { set: 'ion', name: 'star-outline' },
  'star.fill': { set: 'ion', name: 'star' },
  circle: { set: 'ion', name: 'ellipse-outline' },
  // --- настройки / аккаунт / данные ---
  'person.crop.circle.fill': { set: 'ion', name: 'person-circle' },
  'person.crop.circle.badge.plus': { set: 'ion', name: 'person-add' },
  'rectangle.portrait.and.arrow.right': { set: 'ion', name: 'log-out-outline' },
  'rectangle.stack.fill': { set: 'mci', name: 'cards' },
  'creditcard.fill': { set: 'ion', name: 'card' },
  'doc.text.fill': { set: 'ion', name: 'document-text' },
  'envelope.fill': { set: 'ion', name: 'mail' },
  'gift.fill': { set: 'ion', name: 'gift' },
  'square.and.arrow.up': { set: 'ion', name: 'share-outline' },
  'trash.fill': { set: 'ion', name: 'trash' },
  waveform: { set: 'mci', name: 'waveform' },
  checklist: { set: 'mci', name: 'format-list-checks' },
  'arrow.counterclockwise': { set: 'mci', name: 'backup-restore' },
  'arrow.triangle.2.circlepath': { set: 'ion', name: 'sync' },
  // --- категории предметов (см. category-icon.ts) ---
  'car.fill': { set: 'mci', name: 'car' },
  'cup.and.saucer.fill': { set: 'mci', name: 'coffee' },
  'fork.knife': { set: 'mci', name: 'silverware-fork-knife' },
  'house.fill': { set: 'mci', name: 'home' },
  laptopcomputer: { set: 'mci', name: 'laptop' },
  'leaf.fill': { set: 'mci', name: 'leaf' },
  'pawprint.fill': { set: 'mci', name: 'paw' },
  'shippingbox.fill': { set: 'mci', name: 'package-variant-closed' },
  'sofa.fill': { set: 'mci', name: 'sofa-single' },
  'tag.fill': { set: 'mci', name: 'tag' },
  'tshirt.fill': { set: 'mci', name: 'tshirt-crew' },
};

const FALLBACK: Glyph = { set: 'ion', name: 'ellipse' };

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
  const g = MAP[name as unknown as string] ?? FALLBACK;
  if (g.set === 'mci') {
    return <MaterialCommunityIcons name={g.name as never} size={size} color={tint} />;
  }
  return <Ionicons name={g.name as never} size={size} color={tint} />;
}
