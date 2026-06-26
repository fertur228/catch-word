/**
 * Карточка слова (спека §5.4): подробный просмотр сохранённой карточки.
 * Стикер, слово, транскрипция, 🔊, перевод, все примеры, удаление.
 * Редактирование и «тап по слову в примере» — это `[later]` по спеке.
 */
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

export function CardDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, removeCard } = useCollection();
  const card = id ? getById(id) : undefined;

  if (!card) {
    return (
      <Screen>
        <View style={styles.center}>
          <ThemedText type="subtitle">Карточка не найдена</ThemedText>
          <Button title="Назад" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

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
      <View style={styles.hero}>
        <Sticker emoji={card.emoji} size={160} />
      </View>

      <View style={styles.wordRow}>
        <View style={styles.wordTexts}>
          <ThemedText type="title" style={styles.word}>
            {card.word}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            /{card.ipa}/
          </ThemedText>
        </View>
        <SpeakButton text={card.word} language={card.learningLang} />
      </View>

      <ThemedText type="subtitle">{card.translation}</ThemedText>

      {card.category ? (
        <View style={styles.row}>
          <Pill label={card.category} tone="primary" />
        </View>
      ) : null}

      {card.examples.length > 0 ? (
        <View style={styles.examples}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Примеры
          </ThemedText>
          {card.examples.map((ex) => (
            <View key={ex} style={[styles.example, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default">{ex}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button title="Удалить" icon="trash" variant="danger" onPress={onDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  hero: { alignItems: 'center', paddingVertical: Spacing.two },
  wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  wordTexts: { flex: 1, gap: 2 },
  word: { fontSize: 40, lineHeight: 44 },
  row: { flexDirection: 'row' },
  examples: { gap: Spacing.two },
  example: { padding: Spacing.three, borderRadius: Radius.md },
  actions: { marginTop: Spacing.two },
});
