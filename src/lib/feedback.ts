/**
 * Тактильный + звуковой отклик в духе Duolingo: «дзынь» на верно, «бзз» на неверно,
 * лёгкая вибрация на нажатие.
 *
 * Всё через ленивую загрузку и try/catch: expo-haptics и expo-audio — нативные
 * модули, и если их ещё нет в собранном приложении (нужен ребилд dev-клиента),
 * мы просто молча ничего не делаем — приложение не падает. Озвучка самих слов —
 * отдельно, через expo-speech (см. speech.ts), она работает без ребилда.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- ленивая загрузка нативных модулей и ассетов намеренная */

// Нативные модули грузим лениво — до ребилда их может не быть в бинарнике.
let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

let createAudioPlayer: ((src: number) => any) | null = null;
try {
  createAudioPlayer = require('expo-audio').createAudioPlayer;
} catch {
  createAudioPlayer = null;
}

// Звуковые ассеты (короткие WAV). require безопасен — Metro их встроит.
const SOURCES = {
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
} as const;
type Sfx = keyof typeof SOURCES;

// Плееры создаём один раз и переиспользуем (перемотка в начало перед каждым).
const players: Partial<Record<Sfx, any>> = {};

function getPlayer(name: Sfx): any | null {
  if (!createAudioPlayer) return null;
  try {
    if (!players[name]) players[name] = createAudioPlayer(SOURCES[name]);
    return players[name];
  } catch {
    return null;
  }
}

/**
 * Безопасно вызвать нативную функцию: глотаем и синхронный throw, и отклонённый
 * промис. Нативные модули expo-haptics/expo-audio до ребилда возвращают
 * rejected-promise («method is not available on ios») — без .catch это всплывает
 * как «Uncaught (in promise)».
 */
function safe(fn: () => unknown) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Нативный модуль недоступен (нет ребилда) — тихо игнорируем.
  }
}

function play(name: Sfx) {
  const p = getPlayer(name);
  if (!p) return;
  safe(() => p.seekTo(0));
  safe(() => p.play());
}

/** Верный ответ: успех-вибрация + бодрый «дзынь». */
export function feedbackCorrect() {
  safe(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success));
  play('correct');
}

/**
 * Только тактильный «успех» — для покупки/важного подтверждения. Без звука
 * «дзынь» (он из квизов и на экране оплаты звучал бы не к месту).
 */
export function feedbackSuccess() {
  safe(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Неверный ответ: вибрация-ошибка + мягкий «бзз». */
export function feedbackWrong() {
  safe(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error));
  play('wrong');
}

/** Лёгкий тактильный «тык» на обычное нажатие/переворот. */
export function feedbackTap() {
  safe(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Чёткий «средний» удар — для «поймано», важных подтверждений. */
export function feedbackImpact() {
  safe(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Сухой «щелчок» выбора — табы, сегменты, переключатели, чипы. */
export function feedbackSelection() {
  safe(() => Haptics?.selectionAsync());
}
