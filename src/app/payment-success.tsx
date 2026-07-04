import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Confetti } from '@/components/anim/confetti';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedbackCorrect } from '@/lib/feedback';
import { useSubscription } from '@/lib/subscription';

// Polar отправляет ?checkout_id=... в Success URL.
// Опрашиваем статус подписки до 6 раз с шагом 2с (12с суммарно) — вебхук
// обычно приходит быстро, но иногда чуть запаздывает.
const MAX_ATTEMPTS = 6;
const RETRY_MS = 2000;

export default function PaymentSuccess() {
  const theme = useTheme();
  const router = useRouter();
  const { checkout_id } = useLocalSearchParams<{ checkout_id?: string }>();
  const { isPremium, refresh } = useSubscription();

  const [checking, setChecking] = useState(true);
  const [burst, setBurst] = useState(0);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Запускаем опрос: refresh() → если не premium → ещё раз через 2с.
  useEffect(() => {
    let cancelled = false;

    async function attempt() {
      await refresh();
      if (cancelled) return;
      attemptsRef.current += 1;
      if (attemptsRef.current < MAX_ATTEMPTS) {
        timerRef.current = setTimeout(attempt, RETRY_MS);
      } else {
        setChecking(false);
      }
    }

    void attempt();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // refresh стабилен (useCallback) — зависимость безопасна
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Как только isPremium стал true — останавливаем опрос и празднуем.
  useEffect(() => {
    if (isPremium) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setChecking(false);
      setBurst((b) => b + 1);
      feedbackCorrect();
    }
  }, [isPremium]);

  return (
    <ThemedView style={styles.root}>
      {/* Салют при активации Premium. */}
      <Confetti trigger={burst} originTop="34%" count={28} />
      <View style={styles.card}>
        {checking ? (
          <>
            <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="clock.fill" size={48} color={theme.textSecondary} />
            </View>
            <ThemedText style={styles.title}>Проверяем оплату…</ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
              Подождите несколько секунд, мы активируем Premium.
            </ThemedText>
          </>
        ) : isPremium ? (
          <>
            <View style={[styles.icon, { backgroundColor: theme.successSoft }]}>
              <Icon name="checkmark.circle.fill" size={48} color={theme.success} />
            </View>
            <ThemedText style={styles.title}>Premium активирован!</ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
              Безлимитное сканирование и все функции открыты. Добро пожаловать!
            </ThemedText>
          </>
        ) : (
          <>
            <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="clock.badge.checkmark.fill" size={48} color={theme.textSecondary} />
            </View>
            <ThemedText style={styles.title}>Оплата прошла!</ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
              Подписка активируется в течение нескольких секунд — попробуй открыть приложение чуть позже.
            </ThemedText>
          </>
        )}

        {checkout_id ? (
          <View style={[styles.idRow, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">ID: </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
              {checkout_id}
            </ThemedText>
          </View>
        ) : null}

        <Button
          title="Открыть приложение"
          icon="arrow.right"
          onPress={() => router.replace('/')}
        />
        <Button
          title="Связаться с поддержкой"
          variant="ghost"
          icon="envelope.fill"
          onPress={() => {
            if (typeof window !== 'undefined') {
              window.location.href = 'mailto:nodes.kazakhstan@gmail.com?subject=TakeWord Premium';
            }
          }}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: { width: '100%', maxWidth: 400, alignItems: 'center', gap: Spacing.three },
  icon: {
    width: 88,
    height: 88,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  sub: { textAlign: 'center', lineHeight: 22 },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.md,
    maxWidth: '100%',
  },
});
