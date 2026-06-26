/**
 * Моковые данные для MVP — здесь НЕТ ни бэкенда, ни реального распознавания.
 *
 * `RECOGNIZABLE` — это то, что в будущем вернул бы эндпоинт `/recognize`
 * (спека §7.3). Сейчас экран Камеры просто берёт случайный элемент отсюда и
 * показывает его на экране Результата. Когда подключим бэкенд — заменим это
 * настоящим ответом сервера, а экраны менять почти не придётся.
 */
import type { AppLanguage, RecognizableWord, WordCard } from '@/types';
import { freshSrs } from '@/lib/srs';

/** Язык, который «учит» пользователь в демо (озвучка идёт на нём). */
export const LEARNING_LANG = 'en-US';
/** Родной язык пользователя в демо (на нём показываем перевод). */
export const NATIVE_LANG = 'ru-RU';

/** Языки для выбора в онбординге/настройках (спека §5.1: список флагов). */
export const LANGUAGES: AppLanguage[] = [
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
  { code: 'ru-RU', label: 'Русский', flag: '🇷🇺' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { code: 'fr-FR', label: 'Français', flag: '🇫🇷' },
  { code: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'ja-JP', label: '日本語', flag: '🇯🇵' },
  { code: 'ko-KR', label: '한국어', flag: '🇰🇷' },
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
];

/** Найти язык по коду (фолбэк — первый в списке). */
export function getLanguage(code?: string | null): AppLanguage {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Короткий помощник, чтобы не повторять языки в каждой записи. */
function w(
  emoji: string,
  word: string,
  translation: string,
  ipa: string,
  category: string,
  examples: string[],
): RecognizableWord {
  return { emoji, word, translation, ipa, category, examples, learningLang: LEARNING_LANG, nativeLang: NATIVE_LANG };
}

/** Список «узнаваемых» предметов (мок ответа vision-модели). ~50 слов, 10 категорий. */
export const RECOGNIZABLE: RecognizableWord[] = [
  // --- Еда ---
  w('🍎', 'apple', 'яблоко', 'ˈæp.əl', 'Еда', ['I eat an apple every morning.', 'This apple is sweet and juicy.']),
  w('🍌', 'banana', 'банан', 'bəˈnɑː.nə', 'Еда', ['A banana is a great snack after sport.']),
  w('🍞', 'bread', 'хлеб', 'bred', 'Еда', ['She bought fresh bread at the bakery.']),
  w('🧀', 'cheese', 'сыр', 'tʃiːz', 'Еда', ['I love cheese on my pasta.']),
  w('🥚', 'egg', 'яйцо', 'eɡ', 'Еда', ['He boiled an egg for breakfast.']),
  w('🍕', 'pizza', 'пицца', 'ˈpiːt.sə', 'Еда', ['Let’s order a pizza tonight.']),
  w('🍓', 'strawberry', 'клубника', 'ˈstrɔː.bər.i', 'Еда', ['The strawberry tastes amazing.']),
  w('🥕', 'carrot', 'морковь', 'ˈkær.ət', 'Еда', ['Rabbits love to eat a carrot.']),

  // --- Напитки ---
  w('☕', 'coffee', 'кофе', 'ˈkɒf.i', 'Напитки', ['She drinks coffee without sugar.', 'Let’s grab a coffee after class.']),
  w('🍵', 'tea', 'чай', 'tiː', 'Напитки', ['A cup of tea helps me relax.']),
  w('💧', 'water', 'вода', 'ˈwɔː.tər', 'Напитки', ['Drink more water during the day.']),
  w('🥛', 'milk', 'молоко', 'mɪlk', 'Напитки', ['Add some milk to your coffee.']),
  w('🧃', 'juice', 'сок', 'dʒuːs', 'Напитки', ['I had orange juice for breakfast.']),
  w('🍷', 'wine', 'вино', 'waɪn', 'Напитки', ['They shared a bottle of wine.']),

  // --- Мебель ---
  w('🪑', 'chair', 'стул', 'tʃeər', 'Мебель', ['Please pull up a chair and sit down.']),
  w('🛏️', 'bed', 'кровать', 'bed', 'Мебель', ['I make my bed every morning.']),
  w('🛋️', 'sofa', 'диван', 'ˈsəʊ.fə', 'Мебель', ['We watched a movie on the sofa.']),
  w('🪞', 'mirror', 'зеркало', 'ˈmɪr.ər', 'Мебель', ['She looked in the mirror.']),
  w('🗄️', 'cabinet', 'шкаф', 'ˈkæb.ɪ.nət', 'Мебель', ['The plates are in the cabinet.']),

  // --- Дом ---
  w('🪟', 'window', 'окно', 'ˈwɪn.dəʊ', 'Дом', ['Open the window to let in fresh air.']),
  w('🚪', 'door', 'дверь', 'dɔːr', 'Дом', ['Please close the door behind you.']),
  w('🔑', 'key', 'ключ', 'kiː', 'Дом', ['I can’t find my house key.']),
  w('💡', 'lamp', 'лампа', 'læmp', 'Дом', ['Turn on the lamp, it’s dark.']),
  w('🕯️', 'candle', 'свеча', 'ˈkæn.dəl', 'Дом', ['She lit a candle for dinner.']),
  w('🧼', 'soap', 'мыло', 'səʊp', 'Дом', ['Wash your hands with soap.']),

  // --- Природа ---
  w('🌳', 'tree', 'дерево', 'triː', 'Природа', ['A tall tree grows in our backyard.']),
  w('🌸', 'flower', 'цветок', 'ˈflaʊ.ər', 'Природа', ['He gave her a beautiful flower.']),
  w('☀️', 'sun', 'солнце', 'sʌn', 'Природа', ['The sun is shining today.']),
  w('🌙', 'moon', 'луна', 'muːn', 'Природа', ['The moon is full tonight.']),
  w('⛰️', 'mountain', 'гора', 'ˈmaʊn.tɪn', 'Природа', ['We climbed the mountain at dawn.']),
  w('🌊', 'sea', 'море', 'siː', 'Природа', ['The sea is calm this morning.']),

  // --- Животные ---
  w('🐈', 'cat', 'кошка', 'kæt', 'Животные', ['The cat is sleeping on the sofa.']),
  w('🐕', 'dog', 'собака', 'dɒɡ', 'Животные', ['My dog loves long walks.']),
  w('🐦', 'bird', 'птица', 'bɜːd', 'Животные', ['A bird is singing outside.']),
  w('🐟', 'fish', 'рыба', 'fɪʃ', 'Животные', ['We caught a big fish today.']),
  w('🐴', 'horse', 'лошадь', 'hɔːs', 'Животные', ['She rides a horse every weekend.']),
  w('🦋', 'butterfly', 'бабочка', 'ˈbʌt.ə.flaɪ', 'Животные', ['A butterfly landed on the flower.']),

  // --- Транспорт ---
  w('🚲', 'bicycle', 'велосипед', 'ˈbaɪ.sɪ.kəl', 'Транспорт', ['He rides his bicycle to work.']),
  w('🚗', 'car', 'машина', 'kɑːr', 'Транспорт', ['Our car is parked outside.']),
  w('🚌', 'bus', 'автобус', 'bʌs', 'Транспорт', ['I take the bus to school.']),
  w('✈️', 'airplane', 'самолёт', 'ˈeə.pleɪn', 'Транспорт', ['The airplane took off on time.']),
  w('🚆', 'train', 'поезд', 'treɪn', 'Транспорт', ['The train arrives at nine.']),
  w('⛵', 'boat', 'лодка', 'bəʊt', 'Транспорт', ['They sailed the boat across the lake.']),

  // --- Одежда ---
  w('👕', 'shirt', 'рубашка', 'ʃɜːt', 'Одежда', ['He wore a clean white shirt.']),
  w('👟', 'shoe', 'обувь', 'ʃuː', 'Одежда', ['I need a new pair of shoes.']),
  w('🧢', 'hat', 'шляпа', 'hæt', 'Одежда', ['Put on a hat, it’s sunny.']),
  w('🧥', 'jacket', 'куртка', 'ˈdʒæk.ɪt', 'Одежда', ['Take a jacket, it’s cold.']),
  w('🧦', 'socks', 'носки', 'sɒks', 'Одежда', ['These socks are warm and soft.']),

  // --- Технологии ---
  w('📱', 'phone', 'телефон', 'fəʊn', 'Технологии', ['My phone is almost out of battery.']),
  w('💻', 'laptop', 'ноутбук', 'ˈlæp.tɒp', 'Технологии', ['She works on her laptop at the café.']),
  w('🎧', 'headphones', 'наушники', 'ˈhed.fəʊnz', 'Технологии', ['I listen to music with headphones.']),
  w('📷', 'camera', 'камера', 'ˈkæm.ər.ə', 'Технологии', ['He bought a new camera.']),
  w('🖱️', 'mouse', 'мышь', 'maʊs', 'Технологии', ['The mouse stopped working.']),

  // --- Вещи ---
  w('📖', 'book', 'книга', 'bʊk', 'Вещи', ['This book changed the way I think.']),
  w('✏️', 'pencil', 'карандаш', 'ˈpen.səl', 'Вещи', ['Write it down with a pencil.']),
  w('⏰', 'clock', 'часы', 'klɒk', 'Вещи', ['The clock on the wall is slow.']),
  w('🎒', 'backpack', 'рюкзак', 'ˈbæk.pæk', 'Вещи', ['Her backpack is full of books.']),
  w('☂️', 'umbrella', 'зонт', 'ʌmˈbrel.ə', 'Вещи', ['Take an umbrella, it might rain.']),
];

/** Случайный «распознанный» предмет — имитация съёмки. */
export function getRandomRecognizable(): RecognizableWord {
  const i = Math.floor(Math.random() * RECOGNIZABLE.length);
  return RECOGNIZABLE[i];
}

/** Найти предмет по слову (используется экраном Результата); фолбэк — случайный. */
export function getRecognizableByWord(word?: string | null): RecognizableWord {
  if (!word) return getRandomRecognizable();
  return RECOGNIZABLE.find((wd) => wd.word === word) ?? getRandomRecognizable();
}

/** Все категории в порядке появления (для фильтров в Коллекции). */
export const CATEGORIES: string[] = Array.from(
  new Set(RECOGNIZABLE.map((wd) => wd.category).filter((c): c is string => !!c)),
);

/**
 * Стартовые карточки для Коллекции — чтобы экран не был пустым при первом
 * запуске. Берём 8 слов и разносим их во времени + по SRS, чтобы вкладки
 * «Коллекция» и «Повторение» сразу выглядели «живыми»: часть карточек уже
 * пора повторить, часть — освоена.
 */
export function getSeedCards(): WordCard[] {
  const now = Date.now();
  const DAY = 86_400_000;
  // [индекс слова, сколько дней назад пойман, mastery 0..5, через сколько часов повтор (отриц. = уже пора)]
  const plan: [number, number, number, number][] = [
    [0, 6, 4, 24], // apple — освоено, повтор завтра
    [8, 5, 3, -2], // coffee — пора повторить
    [30, 4, 2, -1], // cat — пора повторить
    [37, 3, 1, -5], // car — пора повторить
    [25, 2, 5, 72], // tree — мастер, нескоро
    [47, 1, 0, 0], // phone — новое, пора
    [14, 1, 2, -3], // chair — пора
    [52, 0, 1, 4], // book — недавнее, скоро
  ];
  return plan.map(([idx, daysAgo, mastery, dueInH], i) => {
    const base = RECOGNIZABLE[idx];
    const srs = freshSrs(now);
    return {
      ...base,
      id: `seed-${base.word}`,
      createdAt: now - daysAgo * DAY - i * 60_000,
      ...srs,
      reps: mastery,
      mastery,
      interval: Math.max(0, dueInH * 60),
      dueAt: now + dueInH * 3_600_000,
    };
  });
}
