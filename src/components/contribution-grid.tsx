/**
 * Гитхаб-стайл «карта активности» для вкладки Повторение: столбцы — недели,
 * строки — дни недели (вс…сб). Ячейка тем насыщеннее золотом, чем больше
 * активности в этот день (сканы + пройденные тесты) — в тон пламени стрика.
 *
 * Число недель фиксировано (совпадает с подписью «N недель» в шапке карточки), а
 * размер ячейки считается под ширину карточки (onLayout), чтобы грид РОВНО
 * заполнял строку — без прокрутки и пустых полей. Снизу справа — легенда.
 */
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { useT } from '@/lib/i18n';

const DAY_MS = 86_400_000;
const dayIndexOf = (ms: number) => Math.floor(ms / DAY_MS);
/** День недели: 0 = воскресенье (эпоха, 1 янв 1970 — четверг → +4). */
const weekdayOf = (d: number) => (((d + 4) % 7) + 7) % 7;

const GAP = 3; // зазор между ячейками, px

/** Уровень насыщенности ячейки по числу активностей за день. */
function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/** Прозрачность золотой заливки по уровню (0 — пустая нейтральная ячейка). */
const OPACITY = [0, 0.3, 0.52, 0.78, 1] as const;

export function ContributionGrid({
  activityByDay,
  weeks = 18,
}: {
  activityByDay: Record<number, number>;
  weeks?: number;
}) {
  const theme = useTheme();
  const t = useT();
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - width) > 0.5) setWidth(w);
  };

  // Размер ячейки считаем под ширину так, чтобы `weeks` колонок заполнили строку ровно.
  const cell = width > 0 ? (width - (weeks - 1) * GAP) / weeks : 0;
  const today = dayIndexOf(Date.now());
  const start = today - weekdayOf(today) - (weeks - 1) * 7;

  const fill = (level: 0 | 1 | 2 | 3 | 4) =>
    level === 0
      ? { backgroundColor: theme.backgroundElement }
      : { backgroundColor: theme.gold, opacity: OPACITY[level] };

  return (
    <View style={styles.wrap}>
      <View onLayout={onLayout} style={styles.grid}>
        {cell > 0
          ? Array.from({ length: weeks }, (_, col) => (
              <View key={col} style={styles.col}>
                {Array.from({ length: 7 }, (_, row) => {
                  const d = start + col * 7 + row;
                  const base = { width: cell, height: cell, borderRadius: 2 };
                  // Будущие дни текущей недели — прозрачные заглушки (ровняем сетку).
                  if (d > today) return <View key={row} style={[base, styles.void]} />;
                  return <View key={row} style={[base, fill(levelFor(activityByDay[d] ?? 0))]} />;
                })}
              </View>
            ))
          : null}
      </View>

      {/* Легенда «меньше → больше» — снизу справа */}
      <View style={styles.legend}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Меньше')}
        </ThemedText>
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <View key={l} style={[styles.legendCell, fill(l)]} />
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          {t('Больше')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, alignSelf: 'stretch' },
  grid: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch' },
  col: { gap: GAP },
  void: { backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: GAP, alignSelf: 'flex-end' },
  legendCell: { width: 11, height: 11, borderRadius: 2 },
});
