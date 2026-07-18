/**
 * Геометрия подготовки кадра к скану — чистые вычисления, без нативных модулей
 * (поэтому покрыты тестами: см. scan-geometry.test.ts).
 *
 * Здесь живут два решения, от которых зависит и точность распознавания, и время
 * ожидания:
 *  - какой квадрат кадра соответствует «визиру» (рамке наведения) на экране;
 *  - до какого размера ужимать кадр перед отправкой.
 */
import type { Visor } from '@/lib/scan-job';

/** Прямоугольник кропа в пикселях исходного кадра. */
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Квадрат под «визиром» в пикселях фото.
 *
 * Превью камеры масштабируется в режиме cover (заполняет экран, лишнее
 * обрезается), поэтому точки экрана переводим в пиксели фото через тот же
 * cover-масштаб и берём квадрат вокруг РЕАЛЬНОГО центра визира (visor.cx/cy) —
 * ровно то, что пользователь видел в рамке. Визир НЕ по центру экрана (он выше),
 * и когда-то кроп брали от центра — предмет уезжал из кадра (постмортем в
 * истории проекта). Формулу менять нельзя, не перепроверив тесты.
 *
 * null → кроп невозможен (нет размеров), вызывающий работает кадром целиком.
 */
export function frameCropRect(pw: number, ph: number, visor: Visor): CropRect | null {
  const { cx, cy, side: frameSidePt, screenW, screenH } = visor;
  if (!pw || !ph || pw < 0 || ph < 0 || screenW <= 0 || screenH <= 0) return null;
  // cover-масштаб превью → сторона квадрата в пикселях фото.
  const scale = Math.max(screenW / pw, screenH / ph);
  const side = Math.max(1, Math.min(pw, ph, Math.round(frameSidePt / scale)));
  // Центр визира (в точках экрана) → пиксели фото через ту же cover-трансформацию.
  const cxPx = (cx - screenW / 2) / scale + pw / 2;
  const cyPx = (cy - screenH / 2) / scale + ph / 2;
  return {
    originX: Math.max(0, Math.min(pw - side, Math.round(cxPx - side / 2))),
    originY: Math.max(0, Math.min(ph - side, Math.round(cyPx - side / 2))),
    width: side,
    height: side,
  };
}

/**
 * Нужно ли ужимать кадр и по какой стороне. maxEdge — ПОТОЛОК, а не цель:
 * кадр меньше него не растягиваем. Апскейл раздувал бы аплоад (самую дорогую
 * часть ожидания на мобильной сети), не добавляя ни пикселя информации:
 * квадрат под визиром на iPhone выходит ~1250px и раньше растягивался до 1536.
 *
 * null → ресайз не нужен.
 */
export function resizeToFit(
  width: number,
  height: number,
  maxEdge: number,
): { width: number } | { height: number } | null {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0 || longEdge <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}
