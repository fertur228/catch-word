/**
 * Экран Результата (спека §5.3 — «сердце магии»).
 *
 * Показывает «распознанный» предмет: стикер + слово + транскрипция + 🔊 +
 * перевод + пример. Кнопки: ✓ Сохранить, ↻ Переснять, ✕ Отмена.
 * Данные — мок (см. src/lib/mock-data.ts), бэкенда нет.
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { SpeakButton } from '@/components/speak-button';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { getRandomRecognizable, getRecognizableByWord } from '@/lib/mock-data';
import type { WordCard } from '@/types';

export function ResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { addCard } = useCollection();
  const params = useLocalSearchParams<{ word?: string }>();

  // «Распознанный» предмет держим в state — чтобы «Переснять» дал новое слово.
  const [recognized, setRecognized] = useState(() => getRecognizableByWord(params.word));

  const onSave = async () => {
    const card: WordCard = {
      ...recognized,
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      createdAt: Date.now(),
    };
    await addCard(card);
    Alert.alert('Сохранено ✅', `«${card.word}» теперь в твоей коллекции.`);
    router.back();
  };

  const onRetake = () => setRecognized(getRandomRecognizable());
  const onCancel = () => router.back();

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <Sticker emoji={recognized.emoji} size={140} />
      </View>

      <View style={styles.wordRow}>
        <View style={styles.wordTexts}>
          <ThemedText type="title" style={styles.word}>
            {recognized.word}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            /{recognized.ipa}/
          </ThemedText>
        </View>
        <SpeakButton text={recognized.word} language={recognized.learningLang} />
      </View>

      <ThemedText type="subtitle">{recognized.translation}</ThemedText>

      {recognized.category ? (
        <View style={styles.row}>
          <Pill label={recognized.category} tone="primary" />
        </View>
      ) : null}

      {/* Спека §5.3: Free/Basic — 1 пример. Показываем первый. */}
      {recognized.examples[0] ? (
        <View style={[styles.example, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Пример
          </ThemedText>
          <ThemedText type="default">{recognized.examples[0]}</ThemedText>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button title="Сохранить" icon="checkmark" onPress={onSave} />
        <View style={styles.actionRow}>
          <Button
            title="Переснять"
            icon="arrow.counterclockwise"
            variant="secondary"
            onPress={onRetake}
            style={styles.flex}
          />
          <Button title="Отмена" icon="xmark" variant="ghost" onPress={onCancel} style={styles.flex} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: Spacing.two },
  wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  wordTexts: { flex: 1, gap: 2 },
  word: { fontSize: 40, lineHeight: 44 },
  row: { flexDirection: 'row' },
  example: { padding: Spacing.three, borderRadius: Radius.md, gap: Spacing.one },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  actionRow: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
