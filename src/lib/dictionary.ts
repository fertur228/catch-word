/**
 * Встроенный мини-словарь EN→RU для автозаполнения.
 *
 * Когда пользователь редактирует распознанное слово (экран Результата),
 * мы по английскому слову подставляем перевод + IPA, а пока он печатает —
 * показываем подсказки (autocomplete). Никакого бэкенда: только данные.
 *
 * Категории берём из CATEGORIES (см. mock-data.ts), когда это уместно.
 * Часть слов (части тела) подходящей категории не имеет — у них category нет.
 */
import { RECOGNIZABLE } from '@/lib/mock-data';

/** Одна запись словаря. */
export interface DictEntry {
  word: string; // английское слово (нижний регистр)
  translation: string; // перевод на русский
  ipa: string; // приблизительная транскрипция
  category?: string; // категория из CATEGORIES, если подходит
}

/** Короткий помощник, чтобы не повторять поля в каждой записи. */
function e(word: string, translation: string, ipa: string, category?: string): DictEntry {
  return { word, translation, ipa, category };
}

/**
 * Дополнительные слова (помимо тех, что уже есть в RECOGNIZABLE).
 * ~100 повседневных существительных по категориям приложения.
 */
const EXTRA: DictEntry[] = [
  // --- Еда ---
  e('orange', 'апельсин', 'ˈɒr.ɪndʒ', 'Еда'),
  e('lemon', 'лимон', 'ˈlem.ən', 'Еда'),
  e('tomato', 'помидор', 'təˈmɑː.təʊ', 'Еда'),
  e('potato', 'картофель', 'pəˈteɪ.təʊ', 'Еда'),
  e('onion', 'лук', 'ˈʌn.jən', 'Еда'),
  e('rice', 'рис', 'raɪs', 'Еда'),
  e('meat', 'мясо', 'miːt', 'Еда'),
  e('chicken', 'курица', 'ˈtʃɪk.ɪn', 'Еда'),
  e('cake', 'торт', 'keɪk', 'Еда'),
  e('chocolate', 'шоколад', 'ˈtʃɒk.lət', 'Еда'),
  e('sugar', 'сахар', 'ˈʃʊɡ.ər', 'Еда'),
  e('salt', 'соль', 'sɒlt', 'Еда'),
  e('grape', 'виноград', 'ɡreɪp', 'Еда'),

  // --- Напитки ---
  e('beer', 'пиво', 'bɪər', 'Напитки'),
  e('soda', 'газировка', 'ˈsəʊ.də', 'Напитки'),

  // --- Мебель ---
  e('table', 'стол', 'ˈteɪ.bəl', 'Мебель'),
  e('desk', 'письменный стол', 'desk', 'Мебель'),
  e('shelf', 'полка', 'ʃelf', 'Мебель'),

  // --- Дом ---
  e('wall', 'стена', 'wɔːl', 'Дом'),
  e('floor', 'пол', 'flɔːr', 'Дом'),
  e('roof', 'крыша', 'ruːf', 'Дом'),
  e('stairs', 'лестница', 'steəz', 'Дом'),
  e('kitchen', 'кухня', 'ˈkɪtʃ.ɪn', 'Дом'),
  e('plate', 'тарелка', 'pleɪt', 'Дом'),
  e('cup', 'чашка', 'kʌp', 'Дом'),
  e('glass', 'стакан', 'ɡlɑːs', 'Дом'),
  e('spoon', 'ложка', 'spuːn', 'Дом'),
  e('fork', 'вилка', 'fɔːk', 'Дом'),
  e('knife', 'нож', 'naɪf', 'Дом'),
  e('bottle', 'бутылка', 'ˈbɒt.əl', 'Дом'),

  // --- Природа ---
  e('river', 'река', 'ˈrɪv.ər', 'Природа'),
  e('lake', 'озеро', 'leɪk', 'Природа'),
  e('sky', 'небо', 'skaɪ', 'Природа'),
  e('cloud', 'облако', 'klaʊd', 'Природа'),
  e('rain', 'дождь', 'reɪn', 'Природа'),
  e('snow', 'снег', 'snəʊ', 'Природа'),
  e('star', 'звезда', 'stɑːr', 'Природа'),
  e('grass', 'трава', 'ɡrɑːs', 'Природа'),
  e('leaf', 'лист', 'liːf', 'Природа'),
  e('stone', 'камень', 'stəʊn', 'Природа'),
  e('fire', 'огонь', 'ˈfaɪər', 'Природа'),

  // --- Животные ---
  e('cow', 'корова', 'kaʊ', 'Животные'),
  e('pig', 'свинья', 'pɪɡ', 'Животные'),
  e('sheep', 'овца', 'ʃiːp', 'Животные'),
  e('rabbit', 'кролик', 'ˈræb.ɪt', 'Животные'),
  e('bear', 'медведь', 'beər', 'Животные'),
  e('lion', 'лев', 'ˈlaɪ.ən', 'Животные'),
  e('tiger', 'тигр', 'ˈtaɪ.ɡər', 'Животные'),
  e('elephant', 'слон', 'ˈel.ɪ.fənt', 'Животные'),
  e('monkey', 'обезьяна', 'ˈmʌŋ.ki', 'Животные'),
  e('snake', 'змея', 'sneɪk', 'Животные'),
  e('frog', 'лягушка', 'frɒɡ', 'Животные'),
  e('bee', 'пчела', 'biː', 'Животные'),
  e('duck', 'утка', 'dʌk', 'Животные'),

  // --- Транспорт ---
  e('truck', 'грузовик', 'trʌk', 'Транспорт'),
  e('ship', 'корабль', 'ʃɪp', 'Транспорт'),
  e('taxi', 'такси', 'ˈtæk.si', 'Транспорт'),
  e('motorcycle', 'мотоцикл', 'ˈməʊ.təˌsaɪ.kəl', 'Транспорт'),
  e('helicopter', 'вертолёт', 'ˈhel.ɪˌkɒp.tər', 'Транспорт'),
  e('subway', 'метро', 'ˈsʌb.weɪ', 'Транспорт'),

  // --- Одежда ---
  e('dress', 'платье', 'dres', 'Одежда'),
  e('pants', 'брюки', 'pænts', 'Одежда'),
  e('skirt', 'юбка', 'skɜːt', 'Одежда'),
  e('coat', 'пальто', 'kəʊt', 'Одежда'),
  e('sweater', 'свитер', 'ˈswet.ər', 'Одежда'),
  e('gloves', 'перчатки', 'ɡlʌvz', 'Одежда'),
  e('scarf', 'шарф', 'skɑːf', 'Одежда'),
  e('belt', 'ремень', 'belt', 'Одежда'),
  e('glasses', 'очки', 'ˈɡlɑː.sɪz', 'Одежда'),

  // --- Технологии ---
  e('computer', 'компьютер', 'kəmˈpjuː.tər', 'Технологии'),
  e('keyboard', 'клавиатура', 'ˈkiː.bɔːd', 'Технологии'),
  e('television', 'телевизор', 'ˈtel.ɪ.vɪʒ.ən', 'Технологии'),
  e('screen', 'экран', 'skriːn', 'Технологии'),
  e('charger', 'зарядка', 'ˈtʃɑː.dʒər', 'Технологии'),
  e('speaker', 'колонка', 'ˈspiː.kər', 'Технологии'),
  e('tablet', 'планшет', 'ˈtæb.lət', 'Технологии'),
  e('printer', 'принтер', 'ˈprɪn.tər', 'Технологии'),

  // --- Вещи ---
  e('pen', 'ручка', 'pen', 'Вещи'),
  e('bag', 'сумка', 'bæɡ', 'Вещи'),
  e('box', 'коробка', 'bɒks', 'Вещи'),
  e('newspaper', 'газета', 'ˈnjuːzˌpeɪ.pər', 'Вещи'),
  e('money', 'деньги', 'ˈmʌn.i', 'Вещи'),
  e('wallet', 'кошелёк', 'ˈwɒl.ɪt', 'Вещи'),
  e('toy', 'игрушка', 'tɔɪ', 'Вещи'),
  e('ball', 'мяч', 'bɔːl', 'Вещи'),
  e('ticket', 'билет', 'ˈtɪk.ɪt', 'Вещи'),
  e('map', 'карта', 'mæp', 'Вещи'),
  e('gift', 'подарок', 'ɡɪft', 'Вещи'),
  e('scissors', 'ножницы', 'ˈsɪz.əz', 'Вещи'),

  // --- Части тела (подходящей категории нет) ---
  e('hand', 'рука', 'hænd'),
  e('eye', 'глаз', 'aɪ'),
  e('ear', 'ухо', 'ɪər'),
  e('nose', 'нос', 'nəʊz'),
  e('mouth', 'рот', 'maʊθ'),
  e('foot', 'ступня', 'fʊt'),
  e('head', 'голова', 'hed'),
  e('hair', 'волосы', 'heər'),
  e('tooth', 'зуб', 'tuːθ'),
];

/** Собираем словарь: сперва все RECOGNIZABLE, затем EXTRA, без дублей по слову. */
function buildDictionary(): DictEntry[] {
  const out: DictEntry[] = [];
  const seen = new Set<string>();
  const all: DictEntry[] = [
    // RECOGNIZABLE — источник истины, поэтому идёт первым
    ...RECOGNIZABLE.map((r) => ({
      word: r.word,
      translation: r.translation,
      ipa: r.ipa,
      category: r.category ?? undefined, // в типе допустим null — приводим к undefined
    })),
    ...EXTRA,
  ];
  for (const entry of all) {
    const k = entry.word.trim().toLowerCase();
    if (seen.has(k)) continue; // дубль — пропускаем
    seen.add(k);
    out.push(entry);
  }
  return out;
}

/** Полный словарь (включает все RECOGNIZABLE-слова, без дублей). */
export const DICTIONARY: DictEntry[] = buildDictionary();

/** Точный поиск по слову (без учёта регистра и пробелов по краям). */
export function lookupWord(input: string): DictEntry | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return DICTIONARY.find((d) => d.word.toLowerCase() === q) ?? null;
}

/**
 * Подсказки для автодополнения по мере ввода.
 * Пустой ввод → []. Совпадения по началу слова идут раньше, чем по подстроке.
 */
export function suggestWords(input: string, limit = 6): DictEntry[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const matches = DICTIONARY.filter((d) => d.word.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const aw = a.word.toLowerCase();
    const bw = b.word.toLowerCase();
    const aStarts = aw.startsWith(q);
    const bStarts = bw.startsWith(q);
    // сначала совпадения по началу слова
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    // затем более короткие слова, потом по алфавиту
    if (aw.length !== bw.length) return aw.length - bw.length;
    return aw.localeCompare(bw);
  });
  return matches.slice(0, Math.max(0, limit));
}
