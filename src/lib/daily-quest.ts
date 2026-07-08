/**
 * Ежедневный квест: «найди и сфотографируй 3 предмета за день».
 *
 * Пул — 200 распознаваемых предметов ([слово, перевод, эмодзи]). Три цели на день
 * выбираются ДЕТЕРМИНИРОВАННО по номеру дня (скользящее окно из 3), поэтому у всех
 * одинаковы, не зависят от рандома и переживают перезапуск; за ~67 дней пул
 * прокручивается целиком. IPA (если есть) подтягивается из RECOGNIZABLE.
 * Прогресс (какие из 3 найдены) и серия хранятся в key_value (см. collection-context).
 */
import { RECOGNIZABLE } from '@/lib/mock-data';

const DAY_MS = 86_400_000;

/** Сколько предметов надо найти за день. */
export const QUEST_TARGETS = 3;

/** [слово (en), перевод (ru), эмодзи] — 200 распознаваемых предметов. */
type QuestEntry = readonly [word: string, translation: string, emoji: string];

const QUEST_POOL: QuestEntry[] = [
  // Фрукты и овощи
  ['apple', 'яблоко', '🍎'], ['banana', 'банан', '🍌'], ['orange', 'апельсин', '🍊'],
  ['lemon', 'лимон', '🍋'], ['grapes', 'виноград', '🍇'], ['strawberry', 'клубника', '🍓'],
  ['watermelon', 'арбуз', '🍉'], ['cherry', 'вишня', '🍒'], ['peach', 'персик', '🍑'],
  ['pear', 'груша', '🍐'], ['pineapple', 'ананас', '🍍'], ['tomato', 'помидор', '🍅'],
  ['carrot', 'морковь', '🥕'], ['potato', 'картофель', '🥔'], ['onion', 'лук', '🧅'],
  ['garlic', 'чеснок', '🧄'], ['corn', 'кукуруза', '🌽'], ['cucumber', 'огурец', '🥒'],
  ['pepper', 'перец', '🫑'], ['broccoli', 'брокколи', '🥦'], ['avocado', 'авокадо', '🥑'],
  ['coconut', 'кокос', '🥥'], ['kiwi', 'киви', '🥝'], ['mango', 'манго', '🥭'],
  ['eggplant', 'баклажан', '🍆'], ['mushroom', 'гриб', '🍄'],
  // Еда
  ['bread', 'хлеб', '🍞'], ['cheese', 'сыр', '🧀'], ['egg', 'яйцо', '🥚'],
  ['meat', 'мясо', '🥩'], ['bacon', 'бекон', '🥓'], ['sandwich', 'бутерброд', '🥪'],
  ['burger', 'бургер', '🍔'], ['pizza', 'пицца', '🍕'], ['hotdog', 'хот-дог', '🌭'],
  ['fries', 'картошка фри', '🍟'], ['popcorn', 'попкорн', '🍿'], ['rice', 'рис', '🍚'],
  ['pasta', 'паста', '🍝'], ['soup', 'суп', '🍲'], ['salad', 'салат', '🥗'],
  ['cake', 'торт', '🍰'], ['cookie', 'печенье', '🍪'], ['donut', 'пончик', '🍩'],
  ['chocolate', 'шоколад', '🍫'], ['candy', 'конфета', '🍬'], ['ice cream', 'мороженое', '🍦'],
  ['honey', 'мёд', '🍯'], ['salt', 'соль', '🧂'], ['butter', 'масло', '🧈'],
  ['pancakes', 'блины', '🥞'], ['croissant', 'круассан', '🥐'],
  // Напитки
  ['water', 'вода', '💧'], ['coffee', 'кофе', '☕'], ['tea', 'чай', '🍵'],
  ['milk', 'молоко', '🥛'], ['juice', 'сок', '🧃'], ['wine', 'вино', '🍷'],
  ['beer', 'пиво', '🍺'], ['cocktail', 'коктейль', '🍸'], ['bottle', 'бутылка', '🍾'],
  // Животные
  ['dog', 'собака', '🐶'], ['cat', 'кошка', '🐱'], ['bird', 'птица', '🐦'],
  ['fish', 'рыба', '🐟'], ['rabbit', 'кролик', '🐰'], ['horse', 'лошадь', '🐴'],
  ['cow', 'корова', '🐮'], ['pig', 'свинья', '🐷'], ['sheep', 'овца', '🐑'],
  ['goat', 'коза', '🐐'], ['chicken', 'курица', '🐔'], ['duck', 'утка', '🦆'],
  ['elephant', 'слон', '🐘'], ['lion', 'лев', '🦁'], ['tiger', 'тигр', '🐯'],
  ['bear', 'медведь', '🐻'], ['monkey', 'обезьяна', '🐵'], ['fox', 'лиса', '🦊'],
  ['wolf', 'волк', '🐺'], ['deer', 'олень', '🦌'], ['frog', 'лягушка', '🐸'],
  ['snake', 'змея', '🐍'], ['turtle', 'черепаха', '🐢'], ['snail', 'улитка', '🐌'],
  ['bee', 'пчела', '🐝'], ['butterfly', 'бабочка', '🦋'], ['spider', 'паук', '🕷'],
  ['ant', 'муравей', '🐜'], ['ladybug', 'божья коровка', '🐞'], ['crab', 'краб', '🦀'],
  ['octopus', 'осьминог', '🐙'], ['whale', 'кит', '🐳'], ['dolphin', 'дельфин', '🐬'],
  ['penguin', 'пингвин', '🐧'], ['owl', 'сова', '🦉'], ['eagle', 'орёл', '🦅'],
  ['parrot', 'попугай', '🦜'], ['squirrel', 'белка', '🐿'], ['hedgehog', 'ёж', '🦔'],
  // Природа
  ['tree', 'дерево', '🌳'], ['flower', 'цветок', '🌸'], ['rose', 'роза', '🌹'],
  ['tulip', 'тюльпан', '🌷'], ['sunflower', 'подсолнух', '🌻'], ['cactus', 'кактус', '🌵'],
  ['leaf', 'лист', '🍃'], ['grass', 'трава', '🌿'], ['sun', 'солнце', '☀️'],
  ['moon', 'луна', '🌙'], ['star', 'звезда', '⭐'], ['cloud', 'облако', '☁️'],
  ['rain', 'дождь', '🌧'], ['snow', 'снег', '❄️'], ['mountain', 'гора', '⛰'],
  ['fire', 'огонь', '🔥'], ['rainbow', 'радуга', '🌈'], ['rock', 'камень', '🪨'],
  ['wood', 'бревно', '🪵'], ['shell', 'ракушка', '🐚'], ['feather', 'перо', '🪶'],
  // Дом и мебель
  ['chair', 'стул', '🪑'], ['bed', 'кровать', '🛏'], ['sofa', 'диван', '🛋'],
  ['door', 'дверь', '🚪'], ['window', 'окно', '🪟'], ['mirror', 'зеркало', '🪞'],
  ['lamp', 'лампа', '💡'], ['clock', 'часы', '🕐'], ['candle', 'свеча', '🕯'],
  ['picture', 'картина', '🖼'], ['toilet', 'унитаз', '🚽'], ['bathtub', 'ванна', '🛁'],
  ['shower', 'душ', '🚿'], ['broom', 'веник', '🧹'], ['basket', 'корзина', '🧺'],
  ['soap', 'мыло', '🧼'], ['sponge', 'губка', '🧽'], ['toothbrush', 'зубная щётка', '🪥'],
  ['bucket', 'ведро', '🪣'], ['thread', 'нитка', '🧵'], ['key', 'ключ', '🔑'],
  ['lock', 'замок', '🔒'], ['bell', 'колокольчик', '🔔'], ['box', 'коробка', '📦'],
  // Кухня
  ['plate', 'тарелка', '🍽'], ['fork', 'вилка', '🍴'], ['spoon', 'ложка', '🥄'],
  ['knife', 'нож', '🔪'], ['pot', 'кастрюля', '🍲'], ['kettle', 'чайник', '🫖'],
  ['bowl', 'миска', '🥣'], ['jar', 'банка', '🫙'],
  // Одежда
  ['shirt', 'рубашка', '👕'], ['jeans', 'джинсы', '👖'], ['dress', 'платье', '👗'],
  ['coat', 'пальто', '🧥'], ['socks', 'носки', '🧦'], ['shoes', 'кроссовки', '👟'],
  ['boots', 'ботинки', '👢'], ['hat', 'шляпа', '🎩'], ['cap', 'кепка', '🧢'],
  ['gloves', 'перчатки', '🧤'], ['scarf', 'шарф', '🧣'], ['tie', 'галстук', '👔'],
  ['glasses', 'очки', '👓'], ['sunglasses', 'солнечные очки', '🕶'], ['ring', 'кольцо', '💍'],
  ['watch', 'наручные часы', '⌚'], ['umbrella', 'зонт', '☂️'], ['backpack', 'рюкзак', '🎒'],
  ['bag', 'сумка', '👜'], ['wallet', 'кошелёк', '👛'], ['crown', 'корона', '👑'],
  ['lipstick', 'помада', '💄'],
  // Электроника
  ['phone', 'телефон', '📱'], ['laptop', 'ноутбук', '💻'], ['computer', 'компьютер', '🖥'],
  ['keyboard', 'клавиатура', '⌨️'], ['mouse', 'мышь', '🖱'], ['television', 'телевизор', '📺'],
  ['camera', 'камера', '📷'], ['headphones', 'наушники', '🎧'], ['battery', 'батарейка', '🔋'],
  ['printer', 'принтер', '🖨'], ['radio', 'радио', '📻'], ['telephone', 'телефон', '☎️'],
  ['flashlight', 'фонарик', '🔦'], ['plug', 'вилка (розетка)', '🔌'],
  // Транспорт
  ['car', 'машина', '🚗'], ['bus', 'автобус', '🚌'], ['train', 'поезд', '🚆'],
  ['bicycle', 'велосипед', '🚲'], ['motorcycle', 'мотоцикл', '🏍'], ['airplane', 'самолёт', '✈️'],
  ['boat', 'лодка', '⛵'], ['ship', 'корабль', '🚢'], ['truck', 'грузовик', '🚚'],
  ['taxi', 'такси', '🚕'], ['helicopter', 'вертолёт', '🚁'], ['rocket', 'ракета', '🚀'],
  ['scooter', 'самокат', '🛴'], ['tractor', 'трактор', '🚜'],
  // Школа и офис
  ['book', 'книга', '📚'], ['pen', 'ручка', '🖊'], ['pencil', 'карандаш', '✏️'],
  ['notebook', 'тетрадь', '📓'], ['scissors', 'ножницы', '✂️'], ['ruler', 'линейка', '📏'],
  ['paper', 'бумага', '📄'], ['calendar', 'календарь', '📅'], ['folder', 'папка', '📁'],
  ['paperclip', 'скрепка', '🖇'], ['pushpin', 'кнопка', '📌'], ['crayon', 'мелок', '🖍'],
  ['envelope', 'конверт', '✉️'], ['map', 'карта', '🗺'], ['globe', 'глобус', '🌐'],
  // Игрушки, спорт, музыка
  ['ball', 'мяч', '⚽'], ['basketball', 'баскетбольный мяч', '🏀'], ['tennis ball', 'теннисный мяч', '🎾'],
  ['balloon', 'воздушный шарик', '🎈'], ['kite', 'воздушный змей', '🪁'], ['teddy bear', 'плюшевый мишка', '🧸'],
  ['dice', 'кубик', '🎲'], ['guitar', 'гитара', '🎸'], ['piano', 'пианино', '🎹'],
  ['drum', 'барабан', '🥁'], ['trumpet', 'труба', '🎺'], ['violin', 'скрипка', '🎻'],
  ['microphone', 'микрофон', '🎤'], ['gift', 'подарок', '🎁'],
  // Инструменты и разное
  ['hammer', 'молоток', '🔨'], ['wrench', 'гаечный ключ', '🔧'], ['screwdriver', 'отвёртка', '🪛'],
  ['saw', 'пила', '🪚'], ['axe', 'топор', '🪓'], ['ladder', 'лестница', '🪜'],
  ['magnet', 'магнит', '🧲'], ['compass', 'компас', '🧭'], ['telescope', 'телескоп', '🔭'],
  ['microscope', 'микроскоп', '🔬'], ['thermometer', 'термометр', '🌡'], ['syringe', 'шприц', '💉'],
  ['pill', 'таблетка', '💊'], ['bandage', 'пластырь', '🩹'], ['razor', 'бритва', '🪒'],
  ['coin', 'монета', '🪙'], ['money', 'деньги', '💵'], ['card', 'банковская карта', '💳'],
  ['gem', 'драгоценный камень', '💎'], ['fan', 'веер', '🪭'],
];

export interface DailyQuest {
  /** Слово-цель на изучаемом языке. */
  word: string;
  /** Эмодзи предмета. */
  emoji: string;
  /** Перевод на родной язык. */
  translation: string;
  /** Категория предмета (если известна из RECOGNIZABLE). */
  category: string | null;
  /** Транскрипция (если есть в RECOGNIZABLE, иначе пусто). */
  ipa: string;
  /** Номер дня (для серии и хранения статуса). */
  dayIndex: number;
}

/** Текущий «номер дня» (UTC-сутки). */
export function todayIndex(): number {
  return Math.floor(Date.now() / DAY_MS);
}

/** Сколько миллисекунд осталось до смены квеста (конца текущих суток). */
export function msUntilQuestReset(): number {
  const nextDayStart = (todayIndex() + 1) * DAY_MS;
  return Math.max(0, nextDayStart - Date.now());
}

/** Собрать DailyQuest из записи пула (IPA/категорию берём из RECOGNIZABLE, если есть). */
function buildQuest(entry: QuestEntry, idx: number): DailyQuest {
  const [word, translation, emoji] = entry;
  const hit = RECOGNIZABLE.find((r) => r.word === word);
  return {
    word,
    emoji,
    translation,
    category: hit?.category ?? null,
    ipa: hit?.ipa ?? '',
    dayIndex: idx,
  };
}

/** Три цели на сегодня (детерминированно, скользящее окно из 3 по пулу). */
export function getDailyQuests(): DailyQuest[] {
  const idx = todayIndex();
  const n = QUEST_POOL.length;
  const out: DailyQuest[] = [];
  for (let k = 0; k < QUEST_TARGETS; k += 1) {
    out.push(buildQuest(QUEST_POOL[(idx * QUEST_TARGETS + k) % n], idx));
  }
  return out;
}

/** Нормализация для сравнения: нижний регистр, без артикля, схлопнутые пробелы. */
function normQuest(s: string): string {
  return s.trim().toLowerCase().replace(/^(a|an|the)\s+/, '').replace(/\s+/g, ' ');
}
/** Слова строки (сравнение по токенам: «water bottle» ~ «bottle»). */
function questTokens(s: string): string[] {
  return normQuest(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Совпадает ли пойманный предмет с целью квеста. Сравниваем ВСЕ доступные названия
 * предмета (слово на изучаемом языке + перевод на родной + синонимы) с целью
 * (слово-en + перевод-ru) — нормализованно и по целым словам. Перевод сравнивается
 * на родном языке, поэтому квест засчитывается и когда изучаемый язык НЕ английский
 * (напр. «batería»/«батарейка» ~ цель «battery»/«батарейка»), а также при других
 * названиях/формах («water bottle» ~ «bottle», «batteries» ~ через перевод).
 */
export function matchesQuest(candidates: string[], quest: DailyQuest): boolean {
  const targets = [quest.word, quest.translation].filter(Boolean);
  for (const c of candidates) {
    if (!c) continue;
    const cn = normQuest(c);
    if (!cn) continue;
    const cTok = questTokens(c);
    for (const tg of targets) {
      const tn = normQuest(tg);
      if (!tn) continue;
      if (cn === tn) return true;
      // Общее целое слово длиной >2 (напр. «water bottle» ~ «bottle»).
      const tTok = questTokens(tg);
      if (cTok.some((w) => w.length > 2 && tTok.includes(w))) return true;
    }
  }
  return false;
}
