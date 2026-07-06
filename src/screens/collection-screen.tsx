/**
 * Экран Коллекции / Скрапбук (спека §5.5).
 *
 * CapWords-style витрина пойманных слов: шапка со статистикой (поймано / выучено /
 * серия) + полоса освоения, поиск по слову/переводу, горизонтальные чипы-темы и
 * сетка стикеров. Тап по плитке → карточка слова. Лёгкое «появление» через <Reveal>.
 *
 * Ровно две сортировки (как у CapWords/Drops — больше вариантов вредит):
 *  - «По датам»  — лента, сгруппированная по дню добавления (визуальный дневник);
 *  - «По темам»  — секции по категории предмета; в заголовке темы виден прогресс
 *                  освоения «8/12 выучено» + мини-полоса (Pokédex-эффект «собери набор»).
 * В обоих режимах карточки рисуются сеткой 2×N; выученные слова (mastery≥4) помечены
 * золотым бейджем на плитке. Поиск и фильтр по теме работают в обоих режимах.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { useCountUp } from '@/components/anim/count-up';
import { Chip } from '@/components/chip';
import { DailyQuestCard } from '@/components/daily-quest-card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ProgressBar } from '@/components/progress-bar';
import { Reveal } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SearchBar } from '@/components/search-bar';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WordTile } from '@/components/word-tile';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { feedbackSelection } from '@/lib/feedback';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/collection-context';
import { groupCardsByDay } from '@/lib/dates';
import { firstNameOf, greetingByHour } from '@/lib/greeting';
import { getLang, useT } from '@/lib/i18n';
import { CATEGORIES } from '@/lib/mock-data';
import { pluralWords } from '@/lib/plural';
import { isMastered } from '@/lib/srs';
import type { WordCard } from '@/types';

/** Фильтр «все темы». */
const ALL = 'Все';

/** Тема для карточек без категории (показываем последней секцией). */
const NO_THEME = 'Без темы';

/** Режим сортировки коллекции. */
type SortMode = 'dates' | 'themes';

/** Опции переключателя сортировки. */
const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: 'По датам', value: 'dates' },
  { label: 'По темам', value: 'themes' },
];

/** Одна строка сетки — до двух карточек рядом. */
interface TileRow {
  key: string;
  cards: WordCard[];
}

/** Секция списка (день или тема) с уже разбитыми на пары карточками. */
interface GridSection {
  key: string;
  title: string;
  /** Всего карточек в секции. */
  total: number;
  /** Сколько из них выучено — задано только для секций-тем (включает мини-прогресс). */
  learned?: number;
  data: TileRow[];
}

/** Разбить карточки на строки по 2 для сетки (ключ строки — id первой карточки). */
function toRows(cards: WordCard[]): TileRow[] {
  const rows: TileRow[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    rows.push({ key: cards[i].id, cards: cards.slice(i, i + 2) });
  }
  return rows;
}

/** Сгруппировать карточки по теме (категории) в порядке CATEGORIES, «Без темы» — в конец. */
function groupCardsByTheme(cards: WordCard[]): GridSection[] {
  const byCat = new Map<string, WordCard[]>();
  for (const c of cards) {
    const cat = c.category ?? NO_THEME;
    const bucket = byCat.get(cat);
    if (bucket) bucket.push(c);
    else byCat.set(cat, [c]);
  }
  // Порядок тем: как в CATEGORIES, затем всё остальное, «Без темы» — последней.
  const ordered = [
    ...CATEGORIES.filter((c) => byCat.has(c)),
    ...[...byCat.keys()].filter((c) => c !== NO_THEME && !CATEGORIES.includes(c)),
    ...(byCat.has(NO_THEME) ? [NO_THEME] : []),
  ];
  return ordered.map((cat) => {
    const list = byCat.get(cat) ?? [];
    return {
      key: cat,
      title: cat,
      total: list.length,
      learned: list.filter(isMastered).length,
      data: toRows(list),
    };
  });
}

/** Одна метрика в сводной карточке (минимал, монохром — в духе iOS). */
function Stat({ value, label, flame }: { value: number; label: string; flame?: boolean }) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  // Число «докручивается» 0→value при появлении.
  const display = useCountUp(value);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduce || !flame || value <= 0) return;
    pulse.value = withRepeat(
      withSequence(withTiming(1.18, { duration: 520 }), withTiming(1, { duration: 520 })),
      -1,
      false,
    );
  }, [reduce, flame, value, pulse]);

  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={styles.statCol}>
      <View style={styles.statValueRow}>
        {flame && value > 0 ? (
          <Animated.View style={flameStyle}>
            <Icon name="flame.fill" size={18} color={theme.gold} />
          </Animated.View>
        ) : null}
        <ThemedText style={styles.statValue}>{display}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

export function CollectionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const { cards, loading, stats, removeCard } = useCollection();
  const { user } = useAuth();
  const firstName = firstNameOf(user);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [mode, setMode] = useState<SortMode>('dates');

  // Темы, реально присутствующие в коллекции (в порядке CATEGORIES). Без чипа «Все»:
  // выбранная тема снимается повторным тапом (тогда снова видно все слова).
  const categories = useMemo(() => {
    const present = new Set(cards.map((c) => c.category).filter((c): c is string => !!c));
    return CATEGORIES.filter((c) => present.has(c));
  }, [cards]);

  // Отфильтрованные карточки: тема + поиск по слову/переводу.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (category !== ALL && c.category !== category) return false;
      if (!q) return true;
      return c.word.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q);
    });
  }, [cards, query, category]);

  // Секции под выбранную сортировку: по дню добавления или по теме.
  const sections = useMemo<GridSection[]>(() => {
    if (mode === 'themes') return groupCardsByTheme(filtered);
    return groupCardsByDay(filtered).map((s) => ({
      key: s.key,
      title: s.title,
      total: s.data.length,
      data: toRows(s.data),
    }));
  }, [filtered, mode]);

  const masteryProgress = stats.total > 0 ? stats.mastered / stats.total : 0;

  // Самая свежая карточка — её плитку коротко подсвечиваем свечением.
  const newestId = useMemo(() => {
    let id: string | null = null;
    let max = -Infinity;
    for (const c of cards) {
      if (c.createdAt > max) {
        max = c.createdAt;
        id = c.id;
      }
    }
    return id;
  }, [cards]);

  const openCard = (id: string) => router.push({ pathname: '/card/[id]', params: { id } });
  const resetFilters = () => {
    setQuery('');
    setCategory(ALL);
  };

  // Удаление слова из коллекции: долгое нажатие на плитку → подтверждение.
  const confirmDelete = useCallback(
    (card: WordCard) => {
      Alert.alert(
        t('Удалить слово?'),
        getLang() === 'en'
          ? `“${card.word}” will be removed from your collection.`
          : `«${card.word}» исчезнет из коллекции.`,
        [
          { text: t('Отмена'), style: 'cancel' },
          { text: t('Удалить'), style: 'destructive', onPress: () => removeCard(card.id) },
        ],
      );
    },
    [removeCard, t],
  );

  // Загрузка из БД.
  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  // Коллекция ещё пуста (в демо почти не бывает — сидятся стартовые карточки).
  if (cards.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="sparkles"
          title={t('Коллекция пуста')}
          message={t('Наведи камеру на предмет и поймай своё первое слово.')}
          actionLabel={t('Открыть камеру')}
          onAction={() => router.navigate('/(tabs)')}
        />
      </Screen>
    );
  }

  // Шапка списка: статистика + прогресс + поиск + чипы-темы + переключатель сортировки.
  // Передаём элементом (не функцией-компонентом), чтобы поле поиска не теряло фокус.
  const listHeader = (
    <View style={styles.header}>
      {/* Приветствие по имени — приложение «общается» с пользователем */}
      {firstName ? (
        <Reveal distance={0}>
          <ThemedText type="subtitle" style={styles.greeting}>
            {greetingByHour(new Date().getHours())}, {firstName}!
          </ThemedText>
        </Reveal>
      ) : null}
      {/* Статистика коллекции — единой сгруппированной карточкой (iOS-минимал) */}
      <Reveal delay={0}>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Stat value={stats.total} label={t('Поймано')} />
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <Stat value={stats.mastered} label={t('Выучено')} />
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <Stat value={stats.streak} label={t('Серия')} flame />
        </View>
      </Reveal>

      {/* Ежедневный квест: что сфотографировать сегодня + таймер */}
      <Reveal delay={45}>
        <DailyQuestCard />
      </Reveal>

      {/* Полоса освоения коллекции */}
      <Reveal delay={60}>
        <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressTop}>
            <ThemedText type="smallBold">{t('Освоение')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {stats.mastered} / {stats.total}
            </ThemedText>
          </View>
          <ProgressBar progress={masteryProgress} tone="success" />
        </View>
      </Reveal>

      {/* Поиск по слову или переводу */}
      <Reveal delay={90}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={t('Поиск слова или перевода')} />
      </Reveal>

      {/* Чипы-темы (горизонтальная прокрутка, с выходом за поля) */}
      {categories.length > 0 ? (
        <Reveal delay={120}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}>
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                selected={category === cat}
                onPress={() => {
                  feedbackSelection();
                  // Повторный тап по выбранной теме снимает фильтр (снова все слова).
                  setCategory((prev) => (prev === cat ? ALL : cat));
                }}
              />
            ))}
          </ScrollView>
        </Reveal>
      ) : null}

      {/* Сортировка: «По датам» | «По темам» */}
      <Reveal delay={150}>
        <SegmentedControl
          options={SORT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          value={mode}
          onChange={(m) => {
            feedbackSelection();
            setMode(m);
          }}
        />
      </Reveal>
    </View>
  );

  // Общий пустой стейт (поиск/тема ничего не нашли).
  const emptyComponent = (
    <EmptyState
      icon="magnifyingglass"
      title={t('Ничего не нашлось')}
      message={t('Попробуй другой запрос или тему.')}
      actionLabel={t('Сбросить фильтры')}
      onAction={resetFilters}
    />
  );

  return (
    <Screen padded={false}>
      <SectionList<TileRow, GridSection>
        sections={sections}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        renderSectionHeader={({ section }: { section: SectionListData<TileRow, GridSection> }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            <View style={styles.sectionHeaderTop}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                {(section.key === NO_THEME ? t('Без темы') : section.title).toUpperCase()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {section.learned != null
                  ? `${section.learned}/${section.total} ${t('выучено')}`
                  : getLang() === 'en'
                    ? `${section.total} ${section.total === 1 ? 'word' : 'words'}`
                    : `${section.total} ${pluralWords(section.total)}`}
              </ThemedText>
            </View>
            {/* В режиме «По темам» — мини-полоса прогресса освоения набора. */}
            {section.learned != null ? (
              <ProgressBar
                progress={section.total > 0 ? section.learned / section.total : 0}
                tone="success"
                height={6}
              />
            ) : null}
          </View>
        )}
        renderItem={({ item, index }) => (
          <Reveal delay={Math.min(index, 8) * 35} style={styles.gridRow}>
            {item.cards.map((card) => (
              <View key={card.id} style={styles.cell}>
                <WordTile
                  card={card}
                  onPress={() => openCard(card.id)}
                  onLongPress={() => confirmDelete(card)}
                  highlight={card.id === newestId}
                />
              </View>
            ))}
            {/* Одинокая карточка в строке — добиваем распоркой, чтобы не растягивалась. */}
            {item.cards.length === 1 ? <View style={styles.cell} /> : null}
          </Reveal>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    flexGrow: 1,
  },
  header: { gap: Spacing.three, marginBottom: Spacing.one },
  greeting: { marginTop: Spacing.four, marginBottom: -Spacing.one },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 2 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  statValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  statLabel: { letterSpacing: 0.2 },
  statSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: Spacing.two },
  sectionTitle: { fontWeight: '600', letterSpacing: 0.5, fontSize: 12.5 },
  progressCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Чипы выходят за горизонтальные поля экрана и прокручиваются «под край».
  chipsScroll: { marginHorizontal: -Spacing.four },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  // Заголовок секции (день или тема).
  sectionHeader: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Строка сетки: две плитки рядом, отступ снизу — между строками.
  gridRow: { flexDirection: 'row', gap: Spacing.three, marginBottom: Spacing.three },
  cell: { flex: 1 },
});
