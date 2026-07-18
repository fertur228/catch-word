/**
 * Тексты локальных пушей — мягкий, тёплый тон (дружелюбно, с лёгкой улыбкой,
 * без чувства вины и подколов). Оба языка (RU/EN); на каждую категорию —
 * несколько вариантов, крутятся по «зерну» (день), чтобы не приедались.
 *
 * Чистый модуль без нативных зависимостей — тестируется и переиспользуется
 * нативным слоем (notifications.ts) и планировщиком (notification-plan.ts).
 */
import type { Lang } from '@/lib/i18n';

export type NotifCategory =
  | 'review'
  | 'streak'
  | 'quest'
  | 'winback1'
  | 'winback3'
  | 'winback7'
  | 'winback14'
  | 'winback30'
  | 'firstScan'
  | 'milestoneStreak'
  | 'milestoneWords';

/** Готовый текст пуша. `{n}` в шаблонах уже подставлен. */
export interface NotifText {
  title: string;
  body: string;
}

type Pool = Record<Lang, NotifText[]>;

/** `{n}` → число (серия/сколько слов). */
function fill(t: NotifText, n: number): NotifText {
  return {
    title: t.title.replace('{n}', String(n)),
    body: t.body.replace('{n}', String(n)),
  };
}

const POOLS: Record<NotifCategory, Pool> = {
  review: {
    ru: [
      { title: 'Пора повторить 🙂', body: 'Есть пара минут? Слова ждут повторения.' },
      { title: 'Минутка для слов', body: '5 минут повторения — и они закрепятся надолго.' },
      { title: 'Слова на повторении', body: 'Загляни ненадолго — освежим память вместе.' },
    ],
    en: [
      { title: 'Time to review 🙂', body: 'Got a couple of minutes? Your words are waiting.' },
      { title: 'A moment for words', body: '5 minutes of review makes them stick.' },
      { title: 'Words to review', body: 'Pop in for a bit — let’s refresh them together.' },
    ],
  },
  streak: {
    ru: [
      { title: 'Серия {n} дней 🔥', body: 'Так держать! Не забудь заглянуть сегодня.' },
      { title: 'Твоя серия жива 🔥', body: '{n} дней подряд — здорово. Продолжим сегодня?' },
    ],
    en: [
      { title: '{n}-day streak 🔥', body: 'Keep it going! A quick visit today keeps it alive.' },
      { title: 'Your streak lives 🔥', body: '{n} days in a row — nice. Keep it up today?' },
    ],
  },
  quest: {
    ru: [
      { title: 'Квест дня ждёт 📷', body: '3 предмета, одна камера. Поймаем сегодня?' },
      { title: 'Новый квест дня', body: 'Найди сегодняшние предметы вокруг тебя 📷' },
    ],
    en: [
      { title: 'Daily quest is live 📷', body: '3 objects, one camera. Catch them today?' },
      { title: 'New daily quest', body: 'Find today’s objects around you 📷' },
    ],
  },
  winback1: {
    ru: [{ title: 'Слова скучают 🙂', body: 'Заглянешь на минутку? Одно слово — и снова в деле.' }],
    en: [{ title: 'Your words miss you 🙂', body: 'Drop by for a minute — one word gets you rolling.' }],
  },
  winback3: {
    ru: [{ title: 'Как ты? 🙂', body: 'Пара минут — и снова в потоке. Мы рядом.' }],
    en: [{ title: 'How’s it going? 🙂', body: 'A couple of minutes and you’re back in the flow.' }],
  },
  winback7: {
    ru: [{ title: 'Давно не виделись', body: 'Твоя коллекция ждёт. Вернёшься сегодня?' }],
    en: [{ title: 'Long time no see', body: 'Your collection is waiting. Come back today?' }],
  },
  winback14: {
    ru: [{ title: 'Скучаем! 🙂', body: 'Одно слово в день — и ты снова в ритме.' }],
    en: [{ title: 'We miss you! 🙂', body: 'One word a day and you’re back in rhythm.' }],
  },
  winback30: {
    ru: [{ title: 'Мы тебя помним 🙂', body: 'Готов начать заново? С любого предмета рядом.' }],
    en: [{ title: 'Still here for you 🙂', body: 'Ready for a fresh start? Any object nearby works.' }],
  },
  firstScan: {
    ru: [{ title: 'Первое слово ждёт ✨', body: 'Наведи камеру на что угодно рядом — оно станет карточкой.' }],
    en: [{ title: 'Your first word awaits ✨', body: 'Point the camera at anything nearby — it becomes a card.' }],
  },
  milestoneStreak: {
    ru: [{ title: '{n} дней подряд! 🎉', body: 'Отличная серия. Гордимся тобой!' }],
    en: [{ title: '{n} days in a row! 🎉', body: 'What a streak. We’re proud of you!' }],
  },
  milestoneWords: {
    ru: [{ title: '{n} слов поймано! 🎉', body: 'Коллекция растёт. Так держать!' }],
    en: [{ title: '{n} words caught! 🎉', body: 'Your collection is growing. Keep it up!' }],
  },
};

/** Под-вариант review с числом слов (когда знаем, сколько «просрочено»). */
const REVIEW_N: Pool = {
  ru: [
    { title: '{n} слов ждут', body: '{n} слов готовы к повторению. Заглянешь? 🙂' },
    { title: 'Есть что повторить', body: '{n} слов почти закрепились — добьём вместе?' },
  ],
  en: [
    { title: '{n} words are waiting', body: '{n} words are ready to review. Pop in? 🙂' },
    { title: 'A few to review', body: '{n} words are almost yours — finish them off?' },
  ],
};

/**
 * Выбрать текст для категории. `seed` (обычно индекс дня) даёт стабильную
 * ротацию: в один день — один вариант, назавтра — другой. `n` подставляется
 * в шаблоны `{n}`.
 */
export function pickNotifText(category: NotifCategory, lang: Lang, seed: number, n = 0): NotifText {
  const pool = POOLS[category][lang];
  const chosen = pool[((seed % pool.length) + pool.length) % pool.length];
  return fill(chosen, n);
}

/**
 * Текст напоминания о повторении: если знаем число слов (n>0) — вариант с
 * числом, иначе обычный.
 */
export function pickReviewText(lang: Lang, seed: number, dueCount: number): NotifText {
  if (dueCount > 0) {
    const pool = REVIEW_N[lang];
    return fill(pool[((seed % pool.length) + pool.length) % pool.length], dueCount);
  }
  return pickNotifText('review', lang, seed);
}
