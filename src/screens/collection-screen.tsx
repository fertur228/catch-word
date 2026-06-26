/**
 * Экран Коллекции (спека §5.5): сетка сохранённых карточек.
 * Данные берём из useCollection() (читается из локальной БД). Тап → деталь.
 */
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WordTile } from '@/components/word-tile';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';

export function CollectionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { cards, loading } = useCollection();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <ThemedText type="subtitle">Коллекция пуста</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
            Поймай первое слово на вкладке «Камера».
          </ThemedText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.column}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
            {cards.length} слов в коллекции
          </ThemedText>
        }
        renderItem={({ item }) => (
          <WordTile
            card={item}
            onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.id } })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  emptyText: { textAlign: 'center' },
  list: { padding: Spacing.three, gap: Spacing.three },
  column: { gap: Spacing.three },
  count: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.two },
});
