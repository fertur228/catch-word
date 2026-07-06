/**
 * PurchaseStateView — единый полноэкранный вид состояний покупки: загрузка,
 * успех (конфетти + галочка + success-хаптика, один раз), ошибка и инфо (отмена /
 * «покупок не найдено» / «оплата прошла, ждём»).
 *
 * Чисто ПРЕЗЕНТАЦИОННЫЙ: никакой логики покупки/применения премиума тут нет —
 * состояние и обработчики приходят пропсами (её чинили отдельно, см. subscription.ts).
 * Всё без нативных зависимостей → работает и на web; учитывает safe-area и Reduce
 * Motion (конфетти/анимации сами гаснут).
 */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'expo-symbols';

import { Confetti } from '@/components/anim/confetti';
import { LoadingOrb } from '@/components/anim/loading-orb';
import { Pop } from '@/components/anim/pop';
import { SuccessCheck } from '@/components/anim/success-check';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedbackSuccess } from '@/lib/feedback';

export type PurchaseStateKind = 'loading' | 'success' | 'error' | 'info';

interface ActionSpec {
  label: string;
  icon?: SFSymbol;
  onPress: () => void;
}

export function PurchaseStateView({
  kind,
  title,
  subtitle,
  features,
  iconName,
  tone,
  primary,
  secondary,
  children,
}: {
  kind: PurchaseStateKind;
  title: string;
  subtitle?: string;
  /** Список «что открылось» — показываем только в success. */
  features?: string[];
  /** Иконка для error/info (у success/loading — своя анимация). */
  iconName?: SFSymbol;
  /** Цвет бейджа иконки (ключ темы) для error/info. */
  tone?: ThemeColor;
  primary?: ActionSpec;
  secondary?: ActionSpec;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [burst, setBurst] = useState(0);
  const celebrated = useRef(false);

  // Празднуем ровно один раз, когда становимся 'success': одноразовый залп + хаптика.
  useEffect(() => {
    if (kind === 'success' && !celebrated.current) {
      celebrated.current = true;
      setBurst((b) => b + 1);
      feedbackSuccess();
    }
  }, [kind]);

  const badgeTone: ThemeColor = tone ?? (kind === 'error' ? 'danger' : 'textSecondary');
  const badgeBg = kind === 'error' ? theme.dangerSoft : theme.backgroundElement;

  return (
    <ThemedView style={styles.root}>
      {/* Одноразовый салют для успеха (~1.6с, не зациклен). */}
      <Confetti trigger={burst} count={36} duration={1600} originTop="30%" />

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + Spacing.five, paddingBottom: insets.bottom + Spacing.four },
        ]}>
        <View style={styles.center}>
          {kind === 'success' ? (
            <SuccessCheck />
          ) : kind === 'loading' ? (
            <LoadingOrb />
          ) : (
            <Pop from={0.4} spring="bouncy">
              <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                <Icon
                  name={iconName ?? (kind === 'error' ? 'exclamationmark.triangle.fill' : 'info.circle.fill')}
                  size={44}
                  color={theme[badgeTone]}
                />
              </View>
            </Pop>
          )}

          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}

          {features?.length ? (
            <View style={styles.features}>
              {features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <View style={[styles.featureDot, { backgroundColor: theme.successSoft }]}>
                    <Icon name="checkmark" size={13} color={theme.success} />
                  </View>
                  <ThemedText type="small" style={styles.featureText}>
                    {f}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}

          {children}
        </View>

        {primary || secondary ? (
          <View style={styles.actions}>
            {primary ? (
              <Button title={primary.label} icon={primary.icon} onPress={primary.onPress} />
            ) : null}
            {secondary ? (
              <Button
                title={secondary.label}
                icon={secondary.icon}
                variant="ghost"
                onPress={secondary.onPress}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: Spacing.four, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  badge: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  // lineHeight >= fontSize обязателен: иначе эмодзи/«…» в заголовке подрезаются
  // сверху-снизу, а alignSelf:'stretch' даёт полную ширину под перенос — чтобы
  // крайний глиф (🎉) не срезало справа на узких экранах.
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: Spacing.one,
    alignSelf: 'stretch',
  },
  subtitle: { textAlign: 'center', lineHeight: 22, maxWidth: 340 },
  features: { gap: Spacing.two, marginTop: Spacing.one },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  featureDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureText: { flexShrink: 1 },
  actions: { gap: Spacing.two, width: '100%', maxWidth: 420, alignSelf: 'center' },
});
