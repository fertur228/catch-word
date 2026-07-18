/**
 * Замеры этапов скана (камера → карточка).
 *
 * Зачем: жалобы «распознавание тормозит» невозможно чинить вслепую — модель по
 * замерам стабильно даёт ~1.8 с, а остальное время уходит на телефоне и в сети.
 * Таймер разбивает ожидание на этапы и печатает их в дев-логе; сервер добавляет
 * свои тайминги (заголовок `x-scan-timings` от /recognize).
 *
 * Правила: замеры НИКОГДА не ломают поток (любая ошибка глотается) и в проде
 * ничего не печатают — это инструмент разработки, а не телеметрия.
 */

/** Подпись итогового этапа — по ней его отличают при показе. */
export const TOTAL = 'ИТОГО';

/**
 * Один замеренный этап. Обычно это `ms` миллисекунд; но этап может нести и
 * произвольный текст (`text`) — например, размеры кадра или регион кропа: не
 * время, а факт для диагностики. Если `text` задан, он и показывается вместо «мс».
 */
export interface ScanStage {
  name: string;
  ms: number;
  text?: string;
}

export interface ScanTimer {
  /** Закрыть текущий этап и начать следующий. */
  mark(name: string): void;
  /** Добавить готовый этап (например, серверный тайминг). */
  add(name: string, ms: number): void;
  /** Добавить справочный этап-факт (текст вместо времени) — для диагностики. */
  info(name: string, text: string): void;
  /** Завершить и напечатать сводку (только в __DEV__). */
  done(note?: string): ScanStage[];
}

const noop: ScanTimer = { mark: () => {}, add: () => {}, info: () => {}, done: () => [] };

/**
 * Начать замер скана. Выключенный таймер — пустышка без накладных расходов.
 * Включают его в дев-режиме и в сторовой сборке при «Диагностике скана»
 * (см. src/lib/scan-diag.ts): цифры нужны с реального телефона и сети.
 * Использование: `const t = startScanTimer(); … t.mark('аплоад+модель'); … t.done()`.
 */
export function startScanTimer(enabled = __DEV__): ScanTimer {
  if (!enabled) return noop;
  const t0 = Date.now();
  let last = t0;
  const stages: ScanStage[] = [];
  return {
    mark(name) {
      const now = Date.now();
      stages.push({ name, ms: now - last });
      last = now;
    },
    add(name, ms) {
      if (Number.isFinite(ms)) stages.push({ name, ms: Math.round(ms) });
    },
    info(name, text) {
      stages.push({ name, ms: 0, text });
    },
    done(note) {
      // ИТОГО — последним этапом: это стена времени от затвора до готовой карточки,
      // а НЕ сумма строк выше (серверные тайминги вложены в «сеть + модель»,
      // вырезка Vision идёт параллельно распознаванию).
      stages.push({ name: TOTAL, ms: Date.now() - t0 });
      try {
        const rows = stages
          .map((s) => `  ${s.name.padEnd(26)} ${(s.text ?? `${s.ms} ms`).padStart(9)}`)
          .join('\n');
        console.log(`[скан] ${note ?? ''}\n${rows}`);
      } catch {
        // лог никогда не мешает потоку
      }
      return stages;
    },
  };
}

/**
 * Подписи серверных этапов. Ключи в заголовке — ASCII не по прихоти: значение
 * HTTP-заголовка обязано быть latin-1, и кириллица в нём роняет ответ целиком
 * (наступали — см. историю /recognize). Человеческие подписи рисуем тут.
 */
const SERVER_LABELS: Record<string, string> = {
  gate: 'сервер: гейт лимита',
  model: 'сервер: модель',
  total: 'сервер: итого',
};

/**
 * Разобрать серверные тайминги из заголовка `x-scan-timings`
 * (формат `gate=123;model=1800`) в этапы для таймера.
 */
export function parseServerTimings(header: string | null | undefined): ScanStage[] {
  if (!header) return [];
  try {
    return header
      .split(';')
      .map((p) => p.split('='))
      .filter((kv) => kv.length === 2 && Number.isFinite(Number(kv[1])))
      .map(([name, ms]) => ({
        name: SERVER_LABELS[name.trim()] ?? `сервер: ${name.trim()}`,
        ms: Number(ms),
      }));
  } catch {
    return [];
  }
}
