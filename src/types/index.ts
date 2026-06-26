/**
 * Общие типы приложения.
 *
 * `WordCard` повторяет модель `word_card` из спеки (§7.2). В MVP «стикер» —
 * это эмодзи (`emoji`); в реальной версии вместо него будет вырезанное фото
 * предмета (`imageUri`).
 */

/** Тарифы из спеки §8. */
export type Tier = 'free' | 'basic' | 'premium';

/** Сохранённая карточка слова (одна запись в локальной БД). */
export interface WordCard {
  id: string;
  /** Эмодзи-заглушка вместо стикера (MVP). */
  emoji: string;
  /** Реальное фото/стикер — появится позже (спека §5.3, `[later]`). */
  imageUri?: string | null;
  /** Слово на изучаемом языке (в спеке — `object_label`). */
  word: string;
  /** Перевод на родной язык. */
  translation: string;
  /** Транскрипция, в спеке — `pronunciation_ipa`. */
  ipa: string;
  /** Примеры употребления (в БД хранятся как JSON-строка). */
  examples: string[];
  /** Категория предмета (еда, мебель, …). */
  category?: string | null;
  /** Язык изучения в формате BCP-47, напр. 'en-US' — нужен для озвучки. */
  learningLang: string;
  /** Родной язык, напр. 'ru-RU'. */
  nativeLang: string;
  /** Время сохранения (Unix ms). */
  createdAt: number;
}

/** «Распознаваемый» предмет — то, что бэкенд вернул бы по фото. */
export type RecognizableWord = Omit<WordCard, 'id' | 'createdAt'>;

/** Описание тарифа для экрана Пейволла. */
export interface Plan {
  tier: Tier;
  name: string;
  /** Короткая строка с ценой, как в спеке §8. */
  price: string;
  /** Подпись под ценой (период / условия). */
  priceNote?: string;
  features: string[];
  /** Подсветить как «лучший выбор» (годовой Premium). */
  highlighted?: boolean;
  /** Бейдж сверху карточки, напр. «Best Value». */
  badge?: string;
  ctaLabel: string;
}
