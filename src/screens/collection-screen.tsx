/**
 * Экран Коллекции / Скрапбук (спека §5.5).
 *
 * CapWords-style витрина слов: шапка со статистикой (поймано / выучено / серия)
 * + полоса освоения, поиск по слову/переводу, горизонтальные чипы-категории и
 * сетка стикеров 2×N. Всё читается из useCollection() (локальная БД). Тап по
 * плитке → карточка слова. Лёгкое «появление» через <Reveal>.
 *
 * Переключатель вида «Сетка» | «По датам» (фича 1): в режиме «По датам» те же
 * (отфильтрованные) карточки показываются лентой-SectionList, сгруппированной по
 * дню добавления (groupCardsByDay): заголовок дня + счётчик, компактные строки
 * (стикер + слово + перевод). Поиск и категории работают в обоих режимах.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ProgressBar } from '@/components/progress-bar';
import { Reveal } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SearchBar } from '@/components/search-bar';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { StatCard } from '@/components/stat-card';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WordTile } from '@/components/word-tile';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { groupCardsByDay, type DaySection } from '@/lib/dates';
import { CATEGORIES } from '@/lib/mock-data';
import type { WordCard } from '@/types';

/** Фильтр «все категории». */
const ALL = 'Все';

/** Режим отображения коллекции. */
type ViewMode = 'grid' | 'dates';

/** Опции переключателя вида. */
const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'Сетка', value: 'grid' },
  { label: 'По датам', value: 'dates' },
];

/** Пустая ячейка-распорка — добивает сетку до чётной длины (ровные колонки). */
type Spacer = { id: string; spacer: true };
type GridItem = WordCard | Spacer;

/** Русское склонение слова «слово» по числу (1 слово / 2 слова / 5 слов). */
function pluralWords(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'слово';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'слова';
  return 'слов';
}

/**
 * Компактная строка слова для режима «По датам»: стикер + слово + перевод,
 * тап → карточка. Лёгкая «лесенка» появления через <Reveal> (как в сетке).
 */
function DateRow({ card, index, onPress }: { card: WordCard; index: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Reveal delay={Math.min(index, 8) * 35}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Sticker emoji={card.emoji} size={44} />
        <View style={styles.rowText}>
          <ThemedText type="default" style={styles.rowWord} numberOfLines={1}>
            {card.word}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {card.translation}
          </ThemedText>
        </View>
        <Icon name="chevron.right" size={14} color={theme.textSecondary} />
      </Pressable>
    </Reveal>
  );
}

export function CollectionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { cards, loading, stats } = useCollection();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [mode, setMode] = useState<ViewMode>('grid');

  // Категории, реально присутствующие в коллекции (в порядке CATEGORIES) + «Все».
  const categories = useMemo(() => {
    const present = new Set(cards.map((c) => c.category).filter((c): c is string => !!c));
    return [ALL, ...CATEGORIES.filter((c) => present.has(c))];
  }, [cards]);

  // Отфильтрованные карточки: категория + поиск по слову/переводу.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (category !== ALL && c.category !== category) return false;
      if (!q) return true;
      return c.word.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q);
    });
  }, [cards, query, category]);

  // Добиваем до чётной длины пустой ячейкой — иначе одинокая плитка тянется на всю ширину.
  const gridData = useMemo<GridItem[]>(() => {
    if (filtered.length % 2 === 0) return filtered;
    return [...filtered, { id: '__spacer__', spacer: true }];
  }, [filtered]);

  // Те же отфильтрованные карточки, но сгруппированные по дню добавления.
  const sections = useMemo<DaySection[]>(() => groupCardsByDay(filtered), [filtered]);

  const masteryProgress = stats.total > 0 ? stats.mastered / stats.total : 0;

  const openCard = (id: string) => router.push({ pathname: '/card/[id]', params: { id } });
  const resetFilters = () => {
    setQuery('');
    setCategory(ALL);
  };

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
          title="Коллекция пуста"
          message="Наведи камеру на предмет и поймай своё первое слово."
          actionLabel="Открыть камеру"
          onAction={() => router.navigate('/(tabs)')}
        />
      </Screen>
    );
  }

  // Шапка списка: статистика + прогресс + поиск + чипы + переключатель вида.
  // Передаём элементом (не функцией-компонентом), чтобы поле поиска не теряло фокус.
  // В режиме «Сетка» добавляем заголовок «Мои слова»; в «По датам» его роль
  // выполняют заголовки дней, поэтому там его не показываем.
  const listHeader = (
    <View style={styles.header}>
      {/* Статистика коллекции */}
      <Reveal delay={0}>
        <View style={styles.stats}>
          <StatCard icon="sparkles" tone="accent" value={stats.total} label="Поймано" />
          <StatCard icon="graduationcap.fill" tone="success" value={stats.mastered} label="Выучено" />
          <StatCard icon="flame.fill" tone="gold" value={stats.streak} label="Серия" />
        </View>
      </Reveal>

      {/* Полоса освоения коллекции */}
      <Reveal delay={60}>
        <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressTop}>
            <ThemedText type="smallBold">Освоение</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {stats.mastered} / {stats.total}
            </ThemedText>
          </View>
          <ProgressBar progress={masteryProgress} tone="success" />
        </View>
      </Reveal>

      {/* Поиск по слову или переводу */}
      <Reveal delay={90}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Поиск слова или перевода" />
      </Reveal>

      {/* Чипы-категории (горизонтальная прокрутка, с выходом за поля) */}
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
              onPress={() => setCategory(cat)}
            />
          ))}
        </ScrollView>
      </Reveal>

      {/* Переключатель вида: «Сетка» | «По датам» */}
      <Reveal delay={150}>
        <SegmentedControl options={VIEW_OPTIONS} value={mode} onChange={setMode} />
      </Reveal>

      {/* Заголовок сетки со счётчиком — только в режиме «Сетка» */}
      {mode === 'grid' ? (
        <Reveal delay={180}>
          <SectionHeader
            icon="square.grid.2x2.fill"
            title="Мои слова"
            subtitle={`${filtered.length} ${pluralWords(filtered.length)}`}
          />
        </Reveal>
      ) : null}
    </View>
  );

  // Общий пустой стейт (поиск/категория ничего не нашли) — для обоих режимов.
  const emptyComponent = (
    <EmptyState
      icon="magnifyingglass"
      title="Ничего не нашлось"
      message="Попробуй другой запрос или категорию."
      actionLabel="Сбросить фильтры"
      onAction={resetFilters}
    />
  );

  // Режим «По датам»: лента, сгруппированная по дню добавления.
  if (mode === 'dates') {
    return (
      <Screen padded={false}>
        <SectionList<WordCard, DaySection>
          sections={sections}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled
          contentContainerStyle={styles.dateContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyComponent}
          renderSectionHeader={({ section }: { section: SectionListData<WordCard, DaySection> }) => (
            <View style={[styles.dayHeader, { backgroundColor: theme.background }]}>
              <ThemedText type="smallBold">{section.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {section.data.length} {pluralWords(section.data.length)}
              </ThemedText>
            </View>
          )}
          renderItem={({ item, index }) => (
            <DateRow card={item} index={index} onPress={() => openCard(item.id)} />
          )}
        />
      </Screen>
    );
  }

  // Режим «Сетка» (как и раньше): 2 колонки стикеров.
  return (
    <Screen padded={false}>
      <FlatList<GridItem>
        data={gridData}
        keyExtractor={(item) => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.column}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item, index }) => {
          if ('spacer' in item) return <View style={styles.cell} />;
          return (
            <Reveal style={styles.cell} delay={Math.min(index, 8) * 45}>
              <WordTile card={item} onPress={() => openCard(item.id)} />
            </Reveal>
          );
        }}
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
    gap: Spacing.three,
    flexGrow: 1,
  },
  // Лента «По датам»: без межстрочного gap — отступы задают строки/заголовки.
  dateContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    flexGrow: 1,
  },
  header: { gap: Spacing.three },
  stats: { flexDirection: 'row', gap: Spacing.two },
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
  column: { gap: Spacing.three },
  cell: { flex: 1 },
  // --- Режим «По датам» ---
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  rowText: { flex: 1, gap: 1 },
  rowWord: { fontWeight: '700' },
});
