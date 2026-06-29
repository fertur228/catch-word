/**
 * Карточка слова (спека §5.4): подробный просмотр сохранённой карточки.
 *
 * Большой стикер, слово, транскрипция, 🔊, перевод, категория, «освоение»
 * (звёзды + прогресс + когда повтор), ВСЕ примеры (каждый можно озвучить) и
 * необязательная заметка. Действия: «Повторить сейчас» → вкладка повтора и
 * «Удалить» (с подтверждением). Лёгкая анимация появления (reanimated).
 *
 * Редактирование и «тап по слову в примере» — это `[later]` по спеке.
 * Данные только моковые (см. useCollection / mock-data).
 */
import { useEffect } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ProgressBar } from '@/components/progress-bar';
import { Reveal } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SpeakButton } from '@/components/speak-button';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';

const DAY_MS = 86_400_000;

// --- Маленькие помощники форматирования (RU) ---

/** Выбрать русскую форму слова по числу: [1, 2-4, 5+]. */
function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Когда поймали слово (относительно сейчас). */
function formatCaught(createdAt: number): string {
  const days = Math.floor((Date.now() - createdAt) / DAY_MS);
  if (days <= 0) return 'Поймано сегодня';
  if (days === 1) return 'Поймано вчера';
  return `Поймано ${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
}

/** Когда следующий повтор (по SRS-полю dueAt). */
function formatDue(dueAt?: number): string {
  if (dueAt == null) return 'Готово к повтору';
  const diff = dueAt - Date.now();
  if (diff <= 0) return 'Можно повторить сейчас';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `Повтор через ${mins} ${plural(mins, ['минуту', 'минуты', 'минут'])}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Повтор через ${hours} ${plural(hours, ['час', 'часа', 'часов'])}`;
  const days = Math.round(hours / 24);
  return `Повтор через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}

/** Подпись уровня освоения (0..5). */
function masteryLabel(m: number): string {
  if (m >= 4) return 'Освоено';
  if (m >= 1) return 'В процессе';
  return 'Новое слово';
}

/** Стикер «выпрыгивает» при открытии — приятный момент «вот оно, твоё слово». */
function StickerHero({ category, imageUri }: { category?: string | null; imageUri?: string | null }) {
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, Motion.spring.bouncy);
    opacity.value = withTiming(1, { duration: Motion.duration.base });
  }, [opacity, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Sticker category={category} imageUri={imageUri} size={150} />
    </Animated.View>
  );
}

export function CardDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, removeCard } = useCollection();
  const card = id ? getById(id) : undefined;

  // Карточки нет (удалили / битый id) — дружелюбная заглушка.
  if (!card) {
    return (
      <Screen>
        <EmptyState
          icon="magnifyingglass"
          title="Карточка не найдена"
          message="Возможно, её удалили из коллекции."
          actionLabel="Назад"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  // Уровень освоения 0..5 — для звёзд, прогресса и бейджа.
  const mastery = Math.max(0, Math.min(5, Math.round(card.mastery ?? 0)));
  const masteryTone = mastery >= 4 ? 'success' : mastery >= 1 ? 'accent' : 'neutral';

  // Повтор: пока просто ведём на вкладку «Повторение» (спека — держим просто).
  const onReview = () => router.push('/review');

  const onShare = () => {
    const ipa = card.ipa ? ` /${card.ipa}/` : '';
    Share.share({
      message: `${card.word}${ipa} — ${card.translation}\nПоймал в CatchWord`,
    }).catch(() => {});
  };

  const onDelete = () => {
    Alert.alert('Удалить карточку?', `«${card.word}» исчезнет из коллекции.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await removeCard(card.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      {/* Герой: стикер на тёплой подложке. */}
      <Reveal delay={0}>
        <View style={[styles.hero, { backgroundColor: theme.accentSoft }]}>
          <StickerHero category={card.category} imageUri={card.imageUri} />
        </View>
      </Reveal>

      {/* Слово + транскрипция + кнопка озвучки. */}
      <Reveal delay={70}>
        <View style={styles.wordRow}>
          <View style={styles.wordTexts}>
            <ThemedText type="title" style={styles.word} numberOfLines={2}>
              {card.word}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              /{card.ipa}/
            </ThemedText>
          </View>
          <View style={styles.speakGroup}>
            <SpeakButton text={card.word} language={card.learningLang} size={52} />
            <SpeakButton text={card.word} language={card.learningLang} size={44} slow />
          </View>
        </View>
      </Reveal>

      {/* Перевод + категория + когда поймано. */}
      <Reveal delay={140}>
        <View style={styles.meta}>
          <ThemedText type="subtitle">{card.translation}</ThemedText>
          <View style={styles.metaRow}>
            {card.category ? <Chip label={card.category} icon="square.grid.2x2.fill" /> : null}
            <ThemedText type="small" themeColor="textSecondary">
              {formatCaught(card.createdAt)}
            </ThemedText>
          </View>
        </View>
      </Reveal>

      {/* Освоение: бейдж + звёзды + прогресс + когда повтор. */}
      <Reveal delay={210}>
        <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.panelHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Освоение
            </ThemedText>
            <Badge label={masteryLabel(mastery)} tone={masteryTone} />
          </View>
          <View style={styles.stars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Icon
                key={i}
                name={i < mastery ? 'star.fill' : 'star'}
                size={24}
                color={i < mastery ? theme.gold : theme.backgroundSelected}
              />
            ))}
          </View>
          <ProgressBar progress={mastery / 5} tone="gold" />
          <View style={styles.dueRow}>
            <Icon name="clock.fill" size={14} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {formatDue(card.dueAt)}
            </ThemedText>
          </View>
        </View>
      </Reveal>

      {/* Все примеры — каждый можно озвучить. */}
      {card.examples.length > 0 ? (
        <Reveal delay={280}>
          <View style={styles.examples}>
            <SectionHeader
              title="Примеры"
              icon="text.bubble.fill"
              subtitle={`${card.examples.length} ${plural(card.examples.length, ['пример', 'примера', 'примеров'])}`}
            />
            {card.examples.map((ex, j) => (
              <Reveal key={ex} delay={320 + j * 60}>
                <View style={[styles.example, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="default" style={styles.exampleText}>
                    {ex}
                  </ThemedText>
                  <SpeakButton text={ex} language={card.learningLang} size={38} />
                </View>
              </Reveal>
            ))}
          </View>
        </Reveal>
      ) : null}

      {/* Личная заметка (опционально). */}
      {card.notes ? (
        <Reveal delay={360}>
          <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.panelHeader}>
              <Icon name="note.text" size={16} color={theme.textSecondary} />
              <ThemedText type="smallBold" themeColor="textSecondary">
                Заметка
              </ThemedText>
            </View>
            <ThemedText type="default">{card.notes}</ThemedText>
          </View>
        </Reveal>
      ) : null}

      {/* Действия. */}
      <Reveal delay={420}>
        <View style={styles.actions}>
          <Button title="Повторить сейчас" icon="graduationcap.fill" onPress={onReview} />
          <Button title="Поделиться" icon="square.and.arrow.up" variant="secondary" onPress={onShare} />
          <Button title="Удалить" icon="trash" variant="ghost" onPress={onDelete} />
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
    borderRadius: Radius.xl,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  wordTexts: { flex: 1, gap: 2 },
  speakGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  word: { fontSize: 40, lineHeight: 44 },
  meta: { gap: Spacing.two },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  panel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stars: { flexDirection: 'row', gap: Spacing.one, paddingVertical: Spacing.one },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  examples: { gap: Spacing.two },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  exampleText: { flex: 1 },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
});
