import { describe, expect, it } from 'vitest';

import { frameCropRect, resizeToFit } from '@/lib/scan-geometry';
import type { Visor } from '@/lib/scan-job';

/**
 * Реальный кадр iPhone (4:3, портрет) и реальный экран — числа, на которых
 * кроп и живёт в проде.
 */
const PHOTO = { w: 3024, h: 4032 };
const SCREEN = { w: 393, h: 852 };
const SCAN_FRAME = 264;

/** Визир там, где его меряет камера: по центру X, ВЫШЕ центра Y. */
const visor: Visor = {
  cx: SCREEN.w / 2,
  cy: 360,
  side: SCAN_FRAME,
  screenW: SCREEN.w,
  screenH: SCREEN.h,
};

/**
 * Прежняя реализация кропа (из cropToFrame до рефакторинга «один энкод»).
 * Держим её здесь как эталон: рефакторинг обязан был ускорить путь, НЕ сдвинув
 * рамку (смещение визира уже ломало распознавание — постмортем в истории).
 */
function legacyCrop(pw: number, ph: number, v: Visor) {
  const { cx, cy, side: frameSidePt, screenW, screenH } = v;
  if (!pw || !ph || screenW <= 0 || screenH <= 0) return null;
  const scale = Math.max(screenW / pw, screenH / ph);
  const side = Math.max(1, Math.min(pw, ph, Math.round(frameSidePt / scale)));
  const cxPx = (cx - screenW / 2) / scale + pw / 2;
  const cyPx = (cy - screenH / 2) / scale + ph / 2;
  return {
    originX: Math.max(0, Math.min(pw - side, Math.round(cxPx - side / 2))),
    originY: Math.max(0, Math.min(ph - side, Math.round(cyPx - side / 2))),
    width: side,
    height: side,
  };
}

describe('frameCropRect — кроп по визиру', () => {
  it('совпадает с прежней реализацией на реальном кадре iPhone', () => {
    expect(frameCropRect(PHOTO.w, PHOTO.h, visor)).toEqual(legacyCrop(PHOTO.w, PHOTO.h, visor));
  });

  it('совпадает с прежней реализацией на разных кадрах, экранах и позициях визира', () => {
    const photos = [
      { w: 3024, h: 4032 }, // 4:3 портрет
      { w: 4032, h: 3024 }, // 4:3 ландшафт
      { w: 1170, h: 2532 }, // узкий
      { w: 1080, h: 1080 }, // квадрат
    ];
    const screens = [
      { w: 393, h: 852 }, // iPhone 15
      { w: 320, h: 568 }, // SE
      { w: 430, h: 932 }, // Pro Max
    ];
    for (const p of photos) {
      for (const s of screens) {
        for (const cy of [100, 360, s.h / 2, s.h - 50]) {
          const v: Visor = { cx: s.w / 2, cy, side: SCAN_FRAME, screenW: s.w, screenH: s.h };
          expect(frameCropRect(p.w, p.h, v), `фото ${p.w}x${p.h} экран ${s.w}x${s.h} cy=${cy}`)
            .toEqual(legacyCrop(p.w, p.h, v));
        }
      }
    }
  });

  it('визир выше центра экрана → кроп выше центра кадра (не съезжает в центр)', () => {
    const high: Visor = { ...visor, cy: 300 };
    const rect = frameCropRect(PHOTO.w, PHOTO.h, high)!;
    const centerY = rect.originY + rect.height / 2;
    expect(centerY).toBeLessThan(PHOTO.h / 2);
  });

  it('квадрат остаётся внутри кадра при любом положении визира', () => {
    for (const cy of [-500, 0, 200, 400, 852, 2000]) {
      const rect = frameCropRect(PHOTO.w, PHOTO.h, { ...visor, cy })!;
      expect(rect.originX).toBeGreaterThanOrEqual(0);
      expect(rect.originY).toBeGreaterThanOrEqual(0);
      expect(rect.originX + rect.width).toBeLessThanOrEqual(PHOTO.w);
      expect(rect.originY + rect.height).toBeLessThanOrEqual(PHOTO.h);
      expect(rect.width).toBe(rect.height); // всегда квадрат
    }
  });

  it('нет размеров кадра → null (вызывающий берёт кадр целиком)', () => {
    expect(frameCropRect(0, 0, visor)).toBeNull();
    expect(frameCropRect(PHOTO.w, PHOTO.h, { ...visor, screenW: 0, screenH: 0 })).toBeNull();
  });

  // Регресс 18.07.2026: в prepareScanImage передавались размеры из takePictureAsync
  // (сенсорная ориентация, ландшафт), а manipulateAsync резал развёрнутый портрет —
  // кроп уезжал вправо-вниз, модель узнавала не тот предмет. Размеры ОБЯЗАНЫ
  // совпадать с реальной ориентацией кадра (getSize), иначе центр рамки промахивается.
  it('перепутанная (сенсорная) ориентация размеров промахивается мимо центра рамки', () => {
    // Кадр реально портретный; визир по центру X, чуть выше центра Y.
    const oriented = frameCropRect(3024, 4032, visor)!;
    // Ошибочно передали ландшафтные размеры того же кадра.
    const swapped = frameCropRect(4032, 3024, visor)!;
    const orientedCx = oriented.originX + oriented.width / 2;
    const swappedCx = swapped.originX + swapped.width / 2;
    // Правильный кроп центрирован по X (≈ ширина/2); перепутанный — заметно вбок.
    expect(Math.abs(orientedCx - 3024 / 2)).toBeLessThan(3024 * 0.02);
    expect(Math.abs(swappedCx - 3024 / 2)).toBeGreaterThan(3024 * 0.1);
  });
});

describe('resizeToFit — ужимаем только вниз', () => {
  it('кадр больше потолка — ужимаем по длинной стороне', () => {
    expect(resizeToFit(3024, 4032, 1536)).toEqual({ height: 1536 });
    expect(resizeToFit(4032, 3024, 1536)).toEqual({ width: 1536 });
  });

  it('квадрат под визиром на iPhone (~1251px) НЕ растягиваем до потолка', () => {
    // Регресс, который чинили: безусловный resize раздувал 1251px до 1536px —
    // лишние байты в аплоад без единого лишнего пикселя информации.
    const side = frameCropRect(PHOTO.w, PHOTO.h, visor)!.width;
    expect(side).toBeLessThan(1536);
    expect(resizeToFit(side, side, 1536)).toBeNull();
  });

  it('ровно на потолке — не трогаем', () => {
    expect(resizeToFit(1536, 1536, 1536)).toBeNull();
    expect(resizeToFit(1537, 1000, 1536)).toEqual({ width: 1536 });
  });

  it('нулевые размеры не роняют', () => {
    expect(resizeToFit(0, 0, 1536)).toBeNull();
  });
});
