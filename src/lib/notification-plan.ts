/**
 * Планировщик локальных пушей — ЧИСТАЯ логика (без нативных модулей, тестируется).
 *
 * На вход — текущее состояние обучения (что пора повторить, серия, квест, был ли
 * активен сегодня), на выход — список пушей с абсолютным временем и готовым
 * текстом. Нативный слой (notifications.ts) просто исполняет этот список.
 *
 * Модель локальных пушей (без сервера): всё пред-планируется вперёд, а при любой
 * активности (открыл приложение / поймал слово / прошёл повторение) план
 * пересобирается заново — так «возвращалки» откладываются, пока человек в деле,
 * и срабатывают, только если он перестал заходить.
 *
 * Вежливость: не больше одного утреннего и одного вечернего пуша в день
 * (дедуп по слоту с приоритетом), тихие часы 22:00–08:00.
 */
import type { Lang } from '@/lib/i18n';
import { pickNotifText, pickReviewText, type NotifCategory, type NotifText } from '@/lib/notification-copy';

/**
 * Состояние обучения — то, что собирает collection-context и передаёт в
 * пересчёт пушей (без языка/настроек — их добавляет нативный слой).
 */
export interface LearningState {
  /** Сколько карточек «просрочено» к повторению (dueCards.length). */
  dueCount: number;
  /** Серия дней подряд с активностью. */
  reviewStreak: number;
  /** Была ли активность сегодня (скан/тест) — тогда сегодняшние напоминания глушим. */
  activeToday: boolean;
  /** Выполнен ли дневной квест. */
  questDone: boolean;
  /** Ловил ли пользователь хоть одно слово (иначе — подсказка про первый скан). */
  everScanned: boolean;
}

/** Полное состояние для планировщика (обучение + язык + настройки). */
export interface NotifState extends LearningState {
  lang: Lang;
  /** Какие категории включены (мастер-тумблер проверяет вызывающий). */
  enabled: { review: boolean; streak: boolean; quest: boolean; winback: boolean };
  /** Тихие часы (локальные): начало ≥ конец не бывает — 22 и 8. */
  quietStartHour: number;
  quietEndHour: number;
}

/** Один запланированный пуш. */
export interface PlannedNotif {
  category: NotifCategory;
  fireAt: number;
  title: string;
  body: string;
}

// Слоты (локальное время). Утро — квест; вечер — повторение/серия/возврат.
const QUEST_HOUR = 10;
const REVIEW_HOUR = 19;
const REVIEW_MIN = 30;
const STREAK_HOUR = 20;
const STREAK_MIN = 30;
const WINBACK_HOUR = 18;
const FIRSTSCAN_HOUR = 18;

/** Приоритет при дедупе одного слота (больше — важнее). */
const PRIORITY: Record<NotifCategory, number> = {
  streak: 5,
  review: 4,
  quest: 3,
  firstScan: 2,
  winback1: 1,
  winback3: 1,
  winback7: 1,
  winback14: 1,
  winback30: 1,
  milestoneStreak: 0,
  milestoneWords: 0,
};

/** Абсолютное время: сегодня+dayOffset в hour:minute локального времени. */
function atLocal(nowMs: number, dayOffset: number, hour: number, minute: number): number {
  const d = new Date(nowMs);
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}

/** Ближайшее наступление hour:minute — сегодня, если ещё впереди, иначе завтра. */
function nextOccurrence(nowMs: number, hour: number, minute: number): number {
  const today = atLocal(nowMs, 0, hour, minute);
  return today > nowMs ? today : atLocal(nowMs, 1, hour, minute);
}

/** Локальный «ключ дня» для группировки (год-месяц-день). */
function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Порядковый номер дня — «зерно» ротации текстов (в один день один вариант). */
function daySeed(ms: number): number {
  return Math.floor(atLocal(ms, 0, 0, 0) / 86_400_000);
}

/** Утренний слот (до 13:00) или вечерний — для дедупа «1 утром + 1 вечером». */
function slotOf(ms: number): 'am' | 'pm' {
  return new Date(ms).getHours() < 13 ? 'am' : 'pm';
}

/** Попадает ли время в тихие часы [start,24)∪[0,end). */
function inQuietHours(ms: number, startHour: number, endHour: number): boolean {
  const h = new Date(ms).getHours();
  return h >= startHour || h < endHour;
}

/**
 * Собрать план пушей на ближайшие дни из текущего состояния.
 * Возвращает отсортированный по времени список (после дедупа и тихих часов).
 */
export function planNotifications(state: NotifState, nowMs: number): PlannedNotif[] {
  const { lang } = state;
  const candidates: PlannedNotif[] = [];
  const add = (category: NotifCategory, fireAt: number, text: NotifText) =>
    candidates.push({ category, fireAt, title: text.title, body: text.body });

  // 1) Повторение — ближайший вечер. Если сегодня уже был активен, сегодняшний
  //    вечер пропускаем (напомним завтра).
  if (state.enabled.review) {
    const todayEve = atLocal(nowMs, 0, REVIEW_HOUR, REVIEW_MIN);
    const fireAt =
      !state.activeToday && todayEve > nowMs ? todayEve : atLocal(nowMs, 1, REVIEW_HOUR, REVIEW_MIN);
    add('review', fireAt, pickReviewText(lang, daySeed(fireAt), state.dueCount));
  }

  // 2) Спаси серию — только сегодня вечером и только если серия жива, а сегодня
  //    активности ещё не было. Была активность → пуш не нужен (пересбор его снял).
  if (state.enabled.streak && state.reviewStreak > 0 && !state.activeToday) {
    const fireAt = atLocal(nowMs, 0, STREAK_HOUR, STREAK_MIN);
    if (fireAt > nowMs) add('streak', fireAt, pickNotifText('streak', lang, daySeed(fireAt), state.reviewStreak));
  }

  // 3) Квест дня — ближайшее утро, если не выполнен.
  if (state.enabled.quest && !state.questDone) {
    const fireAt = nextOccurrence(nowMs, QUEST_HOUR, 0);
    add('quest', fireAt, pickNotifText('quest', lang, daySeed(fireAt)));
  }

  // 4) Первый скан — через день после установки, если ещё ни одного слова.
  if (!state.everScanned) {
    add('firstScan', atLocal(nowMs, 1, FIRSTSCAN_HOUR, 0), pickNotifText('firstScan', lang, 0));
  }

  // 5) «Возвращалки» — лесенка на будущее (сработают, если человек перестал
  //    заходить: пока заходит, пересбор их отодвигает).
  if (state.enabled.winback) {
    const ladder: [number, NotifCategory][] = [
      [1, 'winback1'], [3, 'winback3'], [7, 'winback7'], [14, 'winback14'], [30, 'winback30'],
    ];
    for (const [days, cat] of ladder) {
      add(cat, atLocal(nowMs, days, WINBACK_HOUR, 0), pickNotifText(cat, lang, 0));
    }
  }

  // Тихие часы — выкидываем всё, что попало в 22:00–08:00.
  const awake = candidates.filter((c) => !inQuietHours(c.fireAt, state.quietStartHour, state.quietEndHour));

  // Дедуп: в один слот дня (утро/вечер) — только самый приоритетный пуш.
  const bestBySlot = new Map<string, PlannedNotif>();
  for (const c of awake) {
    const slot = `${localDayKey(c.fireAt)}|${slotOf(c.fireAt)}`;
    const prev = bestBySlot.get(slot);
    if (!prev || PRIORITY[c.category] > PRIORITY[prev.category]) bestBySlot.set(slot, c);
  }

  return [...bestBySlot.values()].sort((a, b) => a.fireAt - b.fireAt);
}
