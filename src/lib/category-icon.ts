/**
 * Тема предмета → минималистичная монохромная иконка (SF Symbols) + мягкий
 * цветной фон. Используется как «стикер» слова, пока у карточки нет реального
 * фото-выреза: чисто смотрится на белом, узнаётся с первого взгляда, единый стиль
 * вместо разношёрстных эмодзи.
 *
 * Категории берутся из распознавания (см. mock-data RECOGNIZABLE). Незнакомая или
 * пустая категория → нейтральная заглушка-тег.
 */
import type { SFSymbol } from 'expo-symbols';

import type { ThemeColor } from '@/constants/theme';

export interface CategoryIcon {
  /** Символ SF Symbols. */
  symbol: SFSymbol;
  /** Мягкий фон плитки (ключ темы). */
  soft: ThemeColor;
  /** Цвет самой иконки (ключ темы). */
  strong: ThemeColor;
}

/** Тема → иконка. Цвета разнесены по палитре, чтобы темы различались на глаз. */
const MAP: Record<string, CategoryIcon> = {
  Еда: { symbol: 'fork.knife', soft: 'accentSoft', strong: 'accent' },
  Напитки: { symbol: 'cup.and.saucer.fill', soft: 'warningSoft', strong: 'warning' },
  Животные: { symbol: 'pawprint.fill', soft: 'goldSoft', strong: 'gold' },
  Транспорт: { symbol: 'car.fill', soft: 'primarySoft', strong: 'primary' },
  Природа: { symbol: 'leaf.fill', soft: 'successSoft', strong: 'success' },
  Дом: { symbol: 'house.fill', soft: 'accent2Soft', strong: 'accent2' },
  Технологии: { symbol: 'laptopcomputer', soft: 'primarySoft', strong: 'primary' },
  Одежда: { symbol: 'tshirt.fill', soft: 'accentSoft', strong: 'accent' },
  Мебель: { symbol: 'sofa.fill', soft: 'goldSoft', strong: 'gold' },
  Вещи: { symbol: 'shippingbox.fill', soft: 'accent2Soft', strong: 'accent2' },
};

/** Нейтральная заглушка для слов без темы. */
const FALLBACK: CategoryIcon = { symbol: 'tag.fill', soft: 'backgroundElement', strong: 'textSecondary' };

/** Иконка темы (или нейтральная заглушка, если тема неизвестна/пустая). */
export function categoryIcon(category?: string | null): CategoryIcon {
  if (!category) return FALLBACK;
  return MAP[category] ?? FALLBACK;
}
