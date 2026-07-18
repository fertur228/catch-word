import { describe, expect, it } from 'vitest';

import { planNotifications, type NotifState } from '@/lib/notification-plan';

/** Базовое состояние: всё включено, тихие часы 22–08. */
function state(over: Partial<NotifState> = {}): NotifState {
  return {
    lang: 'ru',
    dueCount: 0,
    reviewStreak: 0,
    activeToday: false,
    questDone: false,
    everScanned: true,
    enabled: { review: true, streak: true, quest: true, winback: true },
    quietStartHour: 22,
    quietEndHour: 8,
    ...over,
  };
}

/** Полдень конкретного дня — стабильная точка отсчёта. */
const NOON = new Date(2026, 6, 20, 12, 0, 0).getTime();

const hourOf = (ms: number) => new Date(ms).getHours();
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

describe('planNotifications', () => {
  it('ничего в тихие часы (все пуши в 08:00–22:00)', () => {
    const plan = planNotifications(state({ reviewStreak: 5, dueCount: 3 }), NOON);
    expect(plan.length).toBeGreaterThan(0);
    for (const n of plan) {
      const h = hourOf(n.fireAt);
      expect(h, `${new Date(n.fireAt)}`).toBeGreaterThanOrEqual(8);
      expect(h).toBeLessThan(22);
    }
  });

  it('не больше 2 пушей в день (1 утро + 1 вечер)', () => {
    const plan = planNotifications(state({ reviewStreak: 9, dueCount: 4 }), NOON);
    const perDay = new Map<string, number>();
    for (const n of plan) perDay.set(dayKey(n.fireAt), (perDay.get(dayKey(n.fireAt)) ?? 0) + 1);
    for (const [, count] of perDay) expect(count).toBeLessThanOrEqual(2);
  });

  it('повторение важнее возвращалки в один вечер (дедуп по приоритету)', () => {
    // activeToday → повтор уходит на завтра 19:30, где уже стоит winback1 18:00.
    // Оба — завтрашний вечер → остаётся только повтор (приоритет выше).
    const plan = planNotifications(state({ activeToday: true }), NOON);
    const tomorrowPm = plan.filter(
      (n) => dayKey(n.fireAt) === dayKey(NOON + 86_400_000) && hourOf(n.fireAt) >= 13,
    );
    expect(tomorrowPm.length).toBe(1);
    expect(tomorrowPm[0].category).toBe('review');
  });

  it('активность сегодня глушит сегодняшнюю серию и переносит повторение на завтра', () => {
    const active = planNotifications(state({ reviewStreak: 5, activeToday: true }), NOON);
    // Никакого streak-пуша сегодня.
    expect(active.find((n) => n.category === 'streak')).toBeUndefined();
    // Повторение — не сегодня вечером, а завтра.
    const review = active.find((n) => n.category === 'review')!;
    expect(dayKey(review.fireAt)).toBe(dayKey(NOON + 86_400_000));
  });

  it('серия жива и день ещё не начат → есть streak-пуш сегодня вечером с числом', () => {
    const plan = planNotifications(state({ reviewStreak: 7 }), NOON);
    const streak = plan.find((n) => n.category === 'streak');
    expect(streak).toBeDefined();
    expect(dayKey(streak!.fireAt)).toBe(dayKey(NOON));
    expect(`${streak!.title} ${streak!.body}`).toContain('7'); // {n} подставлено (в заголовок или тело)
  });

  it('число слов на повторении попадает в текст', () => {
    const plan = planNotifications(state({ dueCount: 12, activeToday: false }), NOON);
    const review = plan.find((n) => n.category === 'review')!;
    expect(`${review.title} ${review.body}`).toContain('12');
  });

  it('первый скан не сделан → подсказка про первый скан, без квеста-заглушки', () => {
    const plan = planNotifications(state({ everScanned: false }), NOON);
    expect(plan.find((n) => n.category === 'firstScan')).toBeDefined();
  });

  it('выключенные категории не планируются', () => {
    const plan = planNotifications(
      state({
        reviewStreak: 5,
        enabled: { review: false, streak: false, quest: false, winback: false },
      }),
      NOON,
    );
    // Остаётся только first-scan? Нет — everScanned=true. Значит пусто.
    expect(plan).toEqual([]);
  });

  it('лесенка возвращалок покрывает 1/3/7/14/30 дней (те, что уцелели после дедупа)', () => {
    // Отключим прочее, чтобы возвращалки не вытеснялись приоритетом.
    const plan = planNotifications(
      state({ enabled: { review: false, streak: false, quest: false, winback: true } }),
      NOON,
    );
    const cats = plan.map((n) => n.category).filter((c) => c.startsWith('winback'));
    expect(cats).toEqual(['winback1', 'winback3', 'winback7', 'winback14', 'winback30']);
  });

  it('текст ротируется по дням (разное «зерно» — разный вариант)', () => {
    const day1 = planNotifications(state({ reviewStreak: 5 }), NOON);
    const day2 = planNotifications(state({ reviewStreak: 5 }), NOON + 86_400_000);
    const s1 = day1.find((n) => n.category === 'streak')!;
    const s2 = day2.find((n) => n.category === 'streak')!;
    // Пул серии из 2 вариантов — соседние дни дают разные тексты.
    expect(s1.body).not.toBe(s2.body);
  });
});
