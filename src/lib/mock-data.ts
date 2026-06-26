/**
 * Моковые данные для MVP — здесь НЕТ ни бэкенда, ни реального распознавания.
 *
 * `RECOGNIZABLE` — это то, что в будущем вернул бы эндпоинт `/recognize`
 * (спека §7.3). Сейчас экран Камеры просто берёт случайный элемент отсюда и
 * показывает его на экране Результата. Когда подключим бэкенд — заменим это
 * настоящим ответом сервера, а экраны менять почти не придётся.
 */
import type { RecognizableWord, WordCard } from '@/types';

/** Язык, который «учит» пользователь в демо (озвучка идёт на нём). */
export const LEARNING_LANG = 'en-US';
/** Родной язык пользователя в демо (на нём показываем перевод). */
export const NATIVE_LANG = 'ru-RU';

/** Список «узнаваемых» предметов (мок ответа vision-модели). */
export const RECOGNIZABLE: RecognizableWord[] = [
  {
    emoji: '🍎', word: 'apple', translation: 'яблоко', ipa: 'ˈæp.əl', category: 'Еда',
    examples: ['I eat an apple every morning.', 'This apple is sweet and juicy.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '☕', word: 'coffee', translation: 'кофе', ipa: 'ˈkɒf.i', category: 'Напитки',
    examples: ['She drinks coffee without sugar.', 'Let’s grab a coffee after class.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🪑', word: 'chair', translation: 'стул', ipa: 'tʃeər', category: 'Мебель',
    examples: ['Please pull up a chair and sit down.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '📖', word: 'book', translation: 'книга', ipa: 'bʊk', category: 'Вещи',
    examples: ['This book changed the way I think.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🔑', word: 'key', translation: 'ключ', ipa: 'kiː', category: 'Вещи',
    examples: ['I can’t find my house key.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🪟', word: 'window', translation: 'окно', ipa: 'ˈwɪn.dəʊ', category: 'Дом',
    examples: ['Open the window to let in fresh air.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🐈', word: 'cat', translation: 'кошка', ipa: 'kæt', category: 'Животные',
    examples: ['The cat is sleeping on the sofa.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🚲', word: 'bicycle', translation: 'велосипед', ipa: 'ˈbaɪ.sɪ.kəl', category: 'Транспорт',
    examples: ['He rides his bicycle to work.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🌳', word: 'tree', translation: 'дерево', ipa: 'triː', category: 'Природа',
    examples: ['A tall tree grows in our backyard.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
  {
    emoji: '🍌', word: 'banana', translation: 'банан', ipa: 'bəˈnɑː.nə', category: 'Еда',
    examples: ['A banana is a great snack after sport.'],
    learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG,
  },
];

/** Случайный «распознанный» предмет — имитация съёмки. */
export function getRandomRecognizable(): RecognizableWord {
  const i = Math.floor(Math.random() * RECOGNIZABLE.length);
  return RECOGNIZABLE[i];
}

/** Найти предмет по слову (используется экраном Результата); фолбэк — случайный. */
export function getRecognizableByWord(word?: string | null): RecognizableWord {
  if (!word) return getRandomRecognizable();
  return RECOGNIZABLE.find((w) => w.word === word) ?? getRandomRecognizable();
}

/**
 * Стартовые карточки для Коллекции — чтобы экран не был пустым при первом
 * запуске (показываем 6 «уже пойманных» слов). Заливаются в БД один раз.
 */
export function getSeedCards(): WordCard[] {
  const now = Date.now();
  return RECOGNIZABLE.slice(0, 6).map((w, i) => ({
    ...w,
    id: `seed-${w.word}`,
    createdAt: now - i * 60_000,
  }));
}
