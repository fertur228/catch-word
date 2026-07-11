/**
 * Глобальное состояние коллекции карточек + пользовательские настройки.
 *
 * Оборачивает SQLite (src/lib/db.ts) и держит данные в состоянии React, чтобы
 * любой экран мог просто вызвать `useCollection()` и получить готовый список
 * карточек, статистику, очередь повторов и методы. Подключается один раз в
 * корневом layout (src/app/_layout.tsx).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth-context';
import { useSubscription } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import * as db from '@/lib/db';
import {
  clearCloudCardsForPair,
  deleteCloudCard,
  pullCards,
  pushCard,
  uploadSticker,
} from '@/lib/cloud-sync';
import {
  fetchAgentQuests,
  getDailyQuests,
  matchesQuest,
  todayIndex,
  type AgentExercise,
  type DailyQuest,
} from '@/lib/daily-quest';
import { LEARNING_LANG, NATIVE_LANG } from '@/lib/mock-data';
import { computeNextReview, freshSrs, isDue, isMastered } from '@/lib/srs';
import type { CollectionStats, SrsRating, UserPrefs, WordCard } from '@/types';

const FREE_SCAN_LIMIT = 3; // 3 бесплатных скана В ДЕНЬ (синхр. с RPC consume_scan)
const FREE_TEST_LIMIT = 1; // 1 бесплатная попытка умного теста В ДЕНЬ
const FREE_PAIR_LIMIT = 2; // free — максимум 2 пары языков (курса); 3-я → paywall

const DAY_MS = 86_400_000;
/** Индекс дня (UTC-сутки) из миллисекунд эпохи — как в computeStreak/квесте. */
const dayIndexOf = (ms: number) => Math.floor(ms / DAY_MS);

/** Результат попытки засчитать слово в квест дня. */
export interface QuestCatch {
  /** Поймана НОВАЯ цель квеста этим словом. */
  caught: boolean;
  /** Сколько целей найдено сегодня (0..3). */
  progress: number;
  /** Всего целей на день. */
  total: number;
  /** Этим уловом квест выполнен полностью (все цели). */
  completed: boolean;
}

/** Ключи настроек в таблице key_value. */
const PREF_LEARNING = 'learning_lang';
const PREF_NATIVE = 'native_lang';
const PREF_ONBOARDED = 'onboarded';
const PREF_QUEST_LAST_DAY = 'quest_last_done_day';
const PREF_QUEST_STREAK = 'quest_streak';
const PREF_QUEST_FOUND = 'quest_found_today';
const PREF_TEST = 'test_attempts'; // {day, count} — попытки умного теста за день
const PREF_ACTIVITY = 'activity_log'; // {dayIndex: testCount} — тесты по дням (для хитмапа)

/** Дефолтные настройки до загрузки/первого запуска (демо: English ← Русский). */
const DEFAULT_PREFS: UserPrefs = {
  learningLang: LEARNING_LANG,
  nativeLang: NATIVE_LANG,
  onboarded: false,
};

interface CollectionContextValue {
  cards: WordCard[];
  loading: boolean;
  /** true — у пользователя активная подписка (Polar). */
  isPremium: boolean;
  /** Сколько сканов осталось (для free: 0–10; для premium: 9999). */
  scansLeft: number;
  scanLimit: number;
  addCard: (card: WordCard) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  /** Удалить все карточки из коллекции. */
  clearCollection: () => Promise<void>;
  getById: (id: string) => WordCard | undefined;
  /** Списать один скан. Возвращает false, если лимит исчерпан. */
  tryScan: () => boolean;
  /** Вернуть один скан (если распознавание не удалось — не «сжигаем» на ошибке). */
  refundScan: () => void;
  /** Пометить лимит исчерпанным (сервер вернул 402) — заблокировать до пейволла. */
  markScansExhausted: () => void;
  /** Сколько попыток умного теста осталось сегодня (premium — без лимита). */
  testsLeftToday: number;
  /** Списать попытку теста. false — у free-пользователя лимит на сегодня исчерпан. */
  useTestAttempt: () => boolean;
  /** Активность по дням (dayIndex → сканы + тесты) — данные для хитмапа. */
  activityByDay: Record<number, number>;
  /** Серия дней подряд с активностью (сканы/тесты) — стрик повторений. */
  reviewStreak: number;
  /** Отметить пройденный тест в журнале активности (для хитмапа/стрика). */
  recordTestSession: () => void;

  // --- Настройки пользователя (онбординг/языки) ---
  prefs: UserPrefs;
  /** Сохранить выбранные языки (изучения и родной). */
  setLanguages: (learning: string, native: string) => Promise<void>;
  /** Можно ли free-пользователю выбрать эту пару языков (premium — всегда да). */
  canUsePair: (learning: string, native: string) => boolean;
  /** Сколько пар языков (курсов) уже начато — по карточкам. */
  usedPairCount: number;
  /** Лимит пар языков для free. */
  pairLimit: number;
  /** Отметить онбординг пройденным (после выбора языка). */
  completeOnboarding: () => Promise<void>;

  // --- Повторение (SRS, спека §5.6) ---
  /** Сводная статистика для дашборда/вкладок. */
  stats: CollectionStats;
  /** Карточки, которые пора повторить (dueAt<=now), самые «просроченные» сверху. */
  dueCards: WordCard[];
  /** Оценить карточку в сессии повтора — пересчитать SRS и сохранить.
   *  opts.holdMastery — интервал двигается, освоение нет (открытые ответы 0.5–0.8). */
  reviewCard: (id: string, rating: SrsRating, opts?: { holdMastery?: boolean }) => Promise<void>;

  // --- Ежедневный квест (найти 3 предмета за день) ---
  /** Три сегодняшние цели (что найти и сфотографировать). */
  dailyQuests: DailyQuest[];
  /** Сообщение ночного агента-тренера (почему сегодня эти цели); null — квест из статического пула. */
  coachMessage: string | null;
  /** Тренировка дня от ночного тренера (пусто — показываем обычные плитки). */
  agentExercises: AgentExercise[];
  /** Слова целей, которые уже найдены сегодня. */
  questFoundWords: string[];
  /** Сколько из целей найдено сегодня (0..3). */
  questProgress: number;
  /** Выполнен ли квест сегодня (найдены все цели). */
  questDoneToday: boolean;
  /** Текущая серия выполненных квестов (дней подряд). */
  questStreak: number;
  /** Засчитать цель, если слово совпало. Возвращает прогресс квеста (X/3). */
  completeQuestForWord: (cand: {
    word: string;
    translation?: string;
    synonyms?: string[];
    questMatch?: string;
  }) => Promise<QuestCatch>;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

/** Простая «серия» дней: сколько дней подряд (включая сегодня) ловили слова. */
function computeStreak(cards: WordCard[]): number {
  if (cards.length === 0) return 0;
  const DAY = 86_400_000;
  // Множество дней (в локальных «индексах дня»), когда добавляли карточки.
  const days = new Set(cards.map((c) => Math.floor(c.createdAt / DAY)));
  const today = Math.floor(Date.now() / DAY);
  let streak = 0;
  // Серия активна, если ловили сегодня или вчера (даём фору в 1 день).
  let cursor = days.has(today) ? today : today - 1;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/**
 * Тот же ли это UTC-день, что и сейчас. Дневной лимит сканов сбрасывается на
 * сервере по current_date (UTC) — на клиенте сравниваем так же, чтобы остаток
 * отображался согласованно с сервером.
 */
function isSameUtcDay(ts: string | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

/**
 * Локальная картинка, которую нужно залить в Storage: нативный файл (file://, /)
 * или веб data/blob URL (вырез на вебе приходит как data URL).
 */
function needsUpload(uri?: string | null): uri is string {
  return (
    !!uri &&
    (uri.startsWith('file://') ||
      uri.startsWith('/') ||
      uri.startsWith('data:') ||
      uri.startsWith('blob:'))
  );
}

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [scansLeft, setScansLeft] = useState(FREE_SCAN_LIMIT);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [questLastDay, setQuestLastDay] = useState(-1);
  const [questStreak, setQuestStreak] = useState(0);
  // Прогресс за день: какие из целей уже найдены (и к какому дню относится).
  const [questFound, setQuestFound] = useState<{ day: number; words: string[] }>({ day: -1, words: [] });
  // Попытки умного теста за день (локально — у теста нет серверной цены).
  const [testAttempts, setTestAttempts] = useState<{ day: number; count: number }>({ day: -1, count: 0 });
  // Журнал активности: тесты по дням (dayIndex → count). Сканы для хитмапа берём из
  // cards.createdAt, поэтому здесь держим ТОЛЬКО тесты (чтобы не задваивать сканы).
  const [testLog, setTestLog] = useState<Record<number, number>>({});

  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const { isPremium } = useSubscription();

  // Первичная загрузка: настройки + карточки (при пустой БД заливаем стартовые).
  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Настройки + статус ежедневного квеста.
      const [learning, native, onboarded, questDayStr, questStreakStr, questFoundStr, testStr] =
        await Promise.all([
          db.getPref(PREF_LEARNING),
          db.getPref(PREF_NATIVE),
          db.getPref(PREF_ONBOARDED),
          db.getPref(PREF_QUEST_LAST_DAY),
          db.getPref(PREF_QUEST_STREAK),
          db.getPref(PREF_QUEST_FOUND),
          db.getPref(PREF_TEST),
        ]);
      if (!alive) return;
      setPrefs({
        learningLang: learning ?? DEFAULT_PREFS.learningLang,
        nativeLang: native ?? DEFAULT_PREFS.nativeLang,
        onboarded: onboarded === 'true',
      });
      setQuestLastDay(questDayStr ? parseInt(questDayStr, 10) : -1);
      setQuestStreak(questStreakStr ? parseInt(questStreakStr, 10) : 0);
      if (questFoundStr) {
        try {
          const parsed = JSON.parse(questFoundStr);
          if (parsed && typeof parsed.day === 'number' && Array.isArray(parsed.words)) {
            setQuestFound({ day: parsed.day, words: parsed.words.map(String) });
          }
        } catch {
          /* игнорируем битый json */
        }
      }
      if (testStr) {
        try {
          const parsed = JSON.parse(testStr);
          if (parsed && typeof parsed.day === 'number' && typeof parsed.count === 'number') {
            setTestAttempts({ day: parsed.day, count: parsed.count });
          }
        } catch {
          /* игнорируем битый json */
        }
      }
      // Карточки загружаются отдельным эффектом ниже — СТРОГО по владельцу (аккаунту),
      // чтобы новый аккаунт не видел карточки прошлого юзера/старые локальные данные.
    })().catch((e) => {
      console.warn('Не удалось загрузить коллекцию:', e);
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const addCard = useCallback(
    async (card: WordCard) => {
      // Гарантируем SRS-поля (если экран их не задал) + помечаем владельцем-аккаунтом.
      const base: WordCard = card.dueAt == null ? { ...card, ...freshSrs(card.createdAt) } : card;
      const withSrs: WordCard = { ...base, ownerId: userId };
      // МГНОВЕННО: сохраняем локально и показываем карточку (с локальной картинкой).
      // Раньше тут ЖДАЛИ загрузку стикера в облако (сеть) — из-за этого «Сохранить
      // в коллекцию» тормозило. Теперь заливаем в фоне, UI не блокируется.
      await db.insertCard(withSrs);
      setCards((prev) => [withSrs, ...prev.filter((c) => c.id !== withSrs.id)]);
      // В ФОНЕ: залить стикер в Storage, подменить локальный URI на облачный и
      // запушить карточку. Медленная сеть/ошибки больше не тормозят сохранение.
      if (userId) {
        void (async () => {
          try {
            let synced = withSrs;
            if (needsUpload(withSrs.imageUri)) {
              const url = await uploadSticker(withSrs.imageUri, userId, withSrs.id);
              if (url && url !== withSrs.imageUri) {
                synced = { ...withSrs, imageUri: url };
                await db.insertCard(synced); // upsert: обновляем на облачный URL
                setCards((prev) => prev.map((c) => (c.id === synced.id ? synced : c)));
              }
            }
            await pushCard(userId, synced);
          } catch {
            /* фоновая синхронизация — best-effort */
          }
        })();
      }
    },
    [userId],
  );

  const removeCard = useCallback(
    async (id: string) => {
      await db.deleteCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      if (userId) deleteCloudCard(userId, id).catch(() => {});
    },
    [userId],
  );

  const getById = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);

  // Карточки — СТРОГО по владельцу. Показываем только карточки текущего аккаунта
  // (или гостевые null-owner, если не вошёл). Для вошедшего облако — источник правды.
  // Ждём восстановления сессии (authLoading), чтобы при старте не мигнуть чужими/легаси
  // карточками. Перезапускается при смене аккаунта: новый аккаунт стартует с пустой коллекции.
  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    (async () => {
      // 1) Быстро показываем локальные карточки ТЕКУЩЕГО владельца.
      const localOwned = await db.getCardsForOwner(userId);
      if (!alive) return;
      setCards(localOwned);
      setLoading(false);

      // 2) Гость (не вошёл) — облака нет, показываем только локальные гостевые.
      if (!userId) return;

      // 3) Вошёл — облако этого аккаунта ЕДИНСТВЕННЫЙ источник правды.
      try {
        const cloud = await pullCards(userId);
        if (!alive) return;
        const cloudIds = new Set(cloud.map((c) => c.id));
        // Локальные карточки владельца, которых НЕТ в облаке (удалены/почищены в
        // Supabase), убираем из локального кэша — иначе они «воскресали» бы при
        // каждом входе. Новые карточки заливает сам addCard в момент сохранения.
        for (const c of localOwned) {
          if (!cloudIds.has(c.id)) await db.deleteCard(c.id);
        }
        // Облачные карточки кладём локально с пометкой владельца (скоуп аккаунта).
        for (const c of cloud) await db.insertCard({ ...c, ownerId: userId });
        if (!alive) return;
        setCards(cloud.map((c) => ({ ...c, ownerId: userId })).sort((a, b) => b.createdAt - a.createdAt));
      } catch (e) {
        console.warn('Синхронизация при входе не удалась:', e);
      }
    })().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId, authLoading]);

  const tryScan = useCallback(() => {
    if (isPremium) return true;
    if (scansLeft <= 0) return false;
    setScansLeft((n) => Math.max(0, n - 1));
    return true;
  }, [isPremium, scansLeft]);

  const refundScan = useCallback(() => {
    if (isPremium) return;
    setScansLeft((n) => Math.min(FREE_SCAN_LIMIT, n + 1));
  }, [isPremium]);

  const markScansExhausted = useCallback(() => setScansLeft(0), []);

  // Серверный остаток бесплатных сканов для ВОШЕДШЕГО free-пользователя.
  // (Гость — счётчик локальный; premium — безлимит.) Делает счётчик устойчивым к
  // рефрешу и синхронным между устройствами. Authoritative-проверка всё равно на
  // сервере (edge `recognize` + RPC `consume_scan`) — это лишь точное отображение.
  useEffect(() => {
    if (!userId || isPremium) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('scan_usage')
          .select('used, updated_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (!alive || !data) return;
        // Дневной лимит: если последняя активность была не сегодня (UTC) — счётчик
        // уже «сброшен» (сервер обнулит при следующем скане), показываем полный остаток.
        const usedToday = isSameUtcDay(data.updated_at as string | null) ? (data.used ?? 0) : 0;
        setScansLeft(Math.max(0, FREE_SCAN_LIMIT - usedToday));
      } catch {
        /* сеть недоступна — оставляем текущее значение */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, isPremium]);

  // Очистить коллекцию ТЕКУЩЕГО курса (активной пары языков). Слова других
  // пар остаются. Стартовые после этого не пересоздаются.
  const clearCollection = useCallback(async () => {
    const { learningLang, nativeLang } = prefs;
    await db.clearCardsForPair(learningLang, nativeLang);
    setCards((prev) =>
      prev.filter((c) => c.learningLang !== learningLang || c.nativeLang !== nativeLang),
    );
    if (userId) clearCloudCardsForPair(userId, learningLang, nativeLang).catch(() => {});
  }, [userId, prefs]);

  const setLanguages = useCallback(async (learning: string, native: string) => {
    await Promise.all([db.setPref(PREF_LEARNING, learning), db.setPref(PREF_NATIVE, native)]);
    setPrefs((p) => ({ ...p, learningLang: learning, nativeLang: native }));
  }, []);

  const completeOnboarding = useCallback(async () => {
    await db.setPref(PREF_ONBOARDED, 'true');
    setPrefs((p) => ({ ...p, onboarded: true }));
  }, []);

  // Уникальные пары языков (курсы), которые у пользователя УЖЕ есть — по карточкам
  // ВСЕХ пар (не только активной). На них завязан free-лимит в 2 пары.
  const usedPairs = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) set.add(`${c.learningLang}|${c.nativeLang}`);
    return set;
  }, [cards]);

  // Может ли free-пользователь открыть эту пару. Premium — без ограничений. Уже
  // начатую пару менять можно всегда; новую — только пока есть свободный слот (<2).
  const canUsePair = useCallback(
    (learning: string, native: string) => {
      if (isPremium) return true;
      if (usedPairs.has(`${learning}|${native}`)) return true;
      return usedPairs.size < FREE_PAIR_LIMIT;
    },
    [isPremium, usedPairs],
  );

  // Журнал активности грузим один раз при монтировании.
  useEffect(() => {
    let alive = true;
    db.getPref(PREF_ACTIVITY)
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const map: Record<number, number> = {};
            for (const [k, v] of Object.entries(parsed)) {
              const d = Number(k);
              const n = Number(v);
              if (Number.isFinite(d) && Number.isFinite(n)) map[d] = n;
            }
            setTestLog(map);
          }
        } catch {
          /* битый json — игнорируем */
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Отметить пройденный тест: +1 к сегодняшнему дню в журнале активности.
  const recordTestSession = useCallback(() => {
    const d = dayIndexOf(Date.now());
    setTestLog((prev) => {
      const next = { ...prev, [d]: (prev[d] ?? 0) + 1 };
      void db.setPref(PREF_ACTIVITY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Активность по дням: сканы (из createdAt всех карточек) + тесты (журнал).
  const activityByDay = useMemo(() => {
    const map: Record<number, number> = {};
    for (const c of cards) {
      const d = dayIndexOf(c.createdAt);
      map[d] = (map[d] ?? 0) + 1;
    }
    for (const [k, v] of Object.entries(testLog)) {
      const d = Number(k);
      map[d] = (map[d] ?? 0) + v;
    }
    return map;
  }, [cards, testLog]);

  // Стрик повторений: сколько дней подряд (считая сегодня/вчера) была активность.
  const reviewStreak = useMemo(() => {
    const today = dayIndexOf(Date.now());
    let cursor = (activityByDay[today] ?? 0) > 0 ? today : today - 1;
    let streak = 0;
    while ((activityByDay[cursor] ?? 0) > 0) {
      streak += 1;
      cursor -= 1;
    }
    return streak;
  }, [activityByDay]);

  const reviewCard = useCallback(
    async (id: string, rating: SrsRating, opts?: { holdMastery?: boolean }) => {
      const current = cards.find((c) => c.id === id);
      if (!current) return;
      const srs = computeNextReview(rating, current);
      // «good без роста освоения» — для открытых ответов со score 0.5–0.8
      // (интервал двигаем, но слово ещё не считаем продвинувшимся).
      if (opts?.holdMastery) srs.mastery = current.mastery ?? 0;
      await db.updateCardSrs(id, srs);
      const updated = { ...current, ...srs };
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (userId) pushCard(userId, updated).catch(() => {});
    },
    [cards, userId],
  );

  // Три сегодняшние цели квеста. Статический пул показывается МГНОВЕННО;
  // если ночной агент-тренер уже составил персональный план (daily_quests),
  // он тихо подменяет пул вместе с сообщением тренера. Агент не отработал /
  // гость / сеть упала → остаёмся на пуле, пользователь разницы не видит.
  // План храним вместе с uid: при выходе/смене аккаунта он просто перестаёт
  // подходить (производное значение), сбрасывать состояние не нужно.
  const staticQuests = useMemo(() => getDailyQuests(), []);
  const [agentPlan, setAgentPlan] = useState<{
    uid: string;
    quests: DailyQuest[];
    coach: string | null;
    exercises: AgentExercise[];
    /** Пока null — план ещё грузится (hero показывает скелетон, не «скачок-замену»). */
    loaded: boolean;
  } | null>(null);
  // agentReloadKey — принудительная перечитка плана (re-pull «вчерашней» вкладки).
  const [agentReloadKey, setAgentReloadKey] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchAgentQuests(userId)
      .then((plan) => {
        if (!alive) return;
        if (plan) {
          setAgentPlan({
            uid: userId,
            quests: plan.quests,
            coach: plan.coachMessage,
            exercises: plan.exercises,
            loaded: true,
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, agentReloadKey]);
  const agentActive = agentPlan !== null && agentPlan.uid === userId;
  const dailyQuests = agentActive ? agentPlan.quests : staticQuests;
  const coachMessage = agentActive ? agentPlan.coach : null;
  const agentExercises = agentActive ? agentPlan.exercises : [];

  // --- Re-pull «вчерашней» вкладки (движок v2, Э3) ---
  // Вкладка, открытая со вчера, не видит ночные reschedule агента и затёрла бы
  // их полным upsert'ом при первом же ответе. Вкладка снова видима и с
  // последней синхронизации прошло >4 ч → перечитываем облако и план агента.
  const lastPullRef = useRef(Date.now());
  useEffect(() => {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !userId) return;
      if (Date.now() - lastPullRef.current < 4 * 3_600_000) return;
      lastPullRef.current = Date.now();
      setAgentReloadKey((k) => k + 1);
      pullCards(userId)
        .then(async (cloud) => {
          for (const c of cloud) await db.insertCard({ ...c, ownerId: userId });
          setCards(cloud.map((c) => ({ ...c, ownerId: userId })).sort((a, b) => b.createdAt - a.createdAt));
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  const completeQuestForWord = useCallback(
    async (cand: {
      word: string;
      translation?: string;
      synonyms?: string[];
      questMatch?: string;
    }): Promise<QuestCatch> => {
      const today = todayIndex();
      const total = dailyQuests.length;
      // Что уже найдено сегодня (при смене дня прогресс обнуляется).
      const foundToday = questFound.day === today ? questFound.words : [];
      const alreadyDone = questLastDay === today;
      // Все названия предмета (слово + перевод + синонимы) + семантическое совпадение
      // от модели (questMatch — точное слово-цель) → сравниваем с целями.
      const candidates = [
        cand.word,
        cand.translation,
        ...(cand.synonyms ?? []),
        cand.questMatch,
      ].filter((s): s is string => !!s);
      // Какая из целей совпала — и не поймана ли уже.
      const target = dailyQuests.find((q) => matchesQuest(candidates, q));
      const already =
        target && foundToday.some((w) => w.toLowerCase() === target.word.toLowerCase());
      if (!target || already) {
        return { caught: false, progress: foundToday.length, total, completed: alreadyDone };
      }
      const newFound = [...foundToday, target.word];
      await db.setPref(PREF_QUEST_FOUND, JSON.stringify({ day: today, words: newFound }));
      setQuestFound({ day: today, words: newFound });
      // Все цели найдены и день ещё не отмечен выполненным → засчитываем квест + серию.
      let completed = alreadyDone;
      if (newFound.length >= total && !alreadyDone) {
        const newStreak = questLastDay === today - 1 ? questStreak + 1 : 1;
        await Promise.all([
          db.setPref(PREF_QUEST_LAST_DAY, String(today)),
          db.setPref(PREF_QUEST_STREAK, String(newStreak)),
        ]);
        setQuestLastDay(today);
        setQuestStreak(newStreak);
        completed = true;
      }
      return { caught: true, progress: newFound.length, total, completed };
    },
    [dailyQuests, questFound, questLastDay, questStreak],
  );

  // Списать попытку умного теста (free = FREE_TEST_LIMIT в день). Premium — без лимита.
  const useTestAttempt = useCallback((): boolean => {
    if (isPremium) return true;
    const today = todayIndex();
    const count = testAttempts.day === today ? testAttempts.count : 0;
    if (count >= FREE_TEST_LIMIT) return false;
    const next = { day: today, count: count + 1 };
    setTestAttempts(next);
    void db.setPref(PREF_TEST, JSON.stringify(next));
    return true;
  }, [isPremium, testAttempts]);

  // «Курс» = активная пара языков. Внутри `cards` лежат карточки ВСЕХ пар
  // (так проще для облачной синхронизации), но наружу — на экраны, в статистику
  // и в очередь повтора — отдаём только слова текущей пары. Сменил пару в
  // Настройках → мгновенно открылась её коллекция (как переключение курса в Duolingo).
  const scopedCards = useMemo(
    () =>
      cards.filter(
        (c) => c.learningLang === prefs.learningLang && c.nativeLang === prefs.nativeLang,
      ),
    [cards, prefs.learningLang, prefs.nativeLang],
  );

  // Производные данные считаются по активному курсу (scopedCards).
  const dueCards = useMemo(
    () => scopedCards.filter((c) => isDue(c)).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    [scopedCards],
  );

  const stats = useMemo<CollectionStats>(
    () => ({
      total: scopedCards.length,
      mastered: scopedCards.filter(isMastered).length,
      dueCount: dueCards.length,
      streak: computeStreak(scopedCards),
    }),
    [scopedCards, dueCards.length],
  );

  const value = useMemo<CollectionContextValue>(() => {
    const today = todayIndex();
    return {
      cards: scopedCards,
      loading,
      isPremium,
      scansLeft: isPremium ? 9999 : scansLeft,
      scanLimit: isPremium ? 9999 : FREE_SCAN_LIMIT,
      addCard,
      removeCard,
      clearCollection,
      getById,
      tryScan,
      refundScan,
      markScansExhausted,
      testsLeftToday: isPremium
        ? 9999
        : Math.max(0, FREE_TEST_LIMIT - (testAttempts.day === today ? testAttempts.count : 0)),
      useTestAttempt,
      activityByDay,
      reviewStreak,
      recordTestSession,
      prefs,
      setLanguages,
      canUsePair,
      usedPairCount: usedPairs.size,
      pairLimit: FREE_PAIR_LIMIT,
      completeOnboarding,
      stats,
      dueCards,
      reviewCard,
      dailyQuests,
      coachMessage,
      agentExercises,
      questFoundWords: questFound.day === today ? questFound.words : [],
      questProgress: questFound.day === today ? questFound.words.length : 0,
      questDoneToday: questLastDay === today,
      // Серия активна, если квест выполняли сегодня или вчера; иначе обнулена.
      questStreak: questLastDay >= today - 1 ? questStreak : 0,
      completeQuestForWord,
    };
  }, [
    scopedCards,
    loading,
    isPremium,
    scansLeft,
    addCard,
    removeCard,
    clearCollection,
    getById,
    tryScan,
    refundScan,
    markScansExhausted,
    testAttempts,
    useTestAttempt,
    activityByDay,
    reviewStreak,
    recordTestSession,
    prefs,
    setLanguages,
    canUsePair,
    usedPairs,
    completeOnboarding,
    stats,
    dueCards,
    reviewCard,
    dailyQuests,
    coachMessage,
    agentExercises,
    questFound,
    questLastDay,
    questStreak,
    completeQuestForWord,
  ]);

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) {
    throw new Error('useCollection нужно вызывать внутри <CollectionProvider>');
  }
  return ctx;
}
