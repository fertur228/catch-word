/**
 * Нормализация темы (категории) слова. Распознавание может вернуть одну и ту же
 * тему в разном регистре или с пробелами («Аксессуар», «АКСЕССУАР», « аксессуар»)
 * — без нормализации коллекция «По темам» дробит одну тему на несколько секций
 * с одинаковым видимым названием (фидбэк тестеров 14.07). Канонический вид:
 * известные темы приводятся к написанию из CATEGORIES, незнакомые — «Первая
 * заглавная, остальные строчные», крайние пробелы срезаются.
 */
import { CATEGORIES } from '@/lib/mock-data';

export function normalizeCategory(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const canon = CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (canon) return canon;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
