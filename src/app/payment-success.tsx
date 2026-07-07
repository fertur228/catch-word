import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PurchaseStateView } from '@/components/purchase-state';
import { ThemedText } from '@/components/themed-text';
import { SUPPORT_EMAIL } from '@/constants/links';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { useSubscription } from '@/lib/subscription';

// Polar отправляет ?checkout_id=... в Success URL.
// Опрашиваем статус подписки до 6 раз с шагом 2с (12с суммарно) — вебхук
// обычно приходит быстро, но иногда чуть запаздывает.
const MAX_ATTEMPTS = 6;
const RETRY_MS = 2000;

export default function PaymentSuccess() {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const { checkout_id } = useLocalSearchParams<{ checkout_id?: string }>();
  const { isPremium, refresh } = useSubscription();

  // Коротко «что открылось» — для экрана успеха.
  const PREMIUM_UNLOCKS = [t('Безлимит сканов'), t('Все языки'), t('Умный тест без лимита')];

  const [checking, setChecking] = useState(true);
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

  // Как только isPremium стал true — останавливаем опрос. Экран успеха рисуется
  // сам (условие рендера `checking && !isPremium`), а конфетти/галочку/хаптику берёт
  // на себя PurchaseStateView при переходе в success — отдельный setState тут не нужен.
  useEffect(() => {
    if (isPremium && timerRef.current) clearTimeout(timerRef.current);
  }, [isPremium]);

  const support: { label: string; icon: 'envelope.fill'; onPress: () => void } = {
    label: t('Связаться с поддержкой'),
    icon: 'envelope.fill',
    onPress: () => {
      if (typeof window !== 'undefined') {
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=TakeWord Premium`;
      }
    },
  };

  // Ещё проверяем оплату — аккуратная загрузка.
  if (checking && !isPremium) {
    return (
      <PurchaseStateView
        kind="loading"
        title={t('Проверяем оплату…')}
        subtitle={t('Пара секунд — активируем Premium.')}
      />
    );
  }

  // Премиум активен — праздничный успех.
  if (isPremium) {
    return (
      <PurchaseStateView
        kind="success"
        title={t('Premium активирован 🎉')}
        subtitle={t('Безлимит сканов, все языки и тесты — всё открыто. Добро пожаловать!')}
        features={PREMIUM_UNLOCKS}
        primary={{ label: t('Начать'), icon: 'arrow.right', onPress: () => router.replace('/') }}
        secondary={support}
      />
    );
  }

  // Оплата прошла, но вебхук ещё не докатился — спокойное «ждём».
  return (
    <PurchaseStateView
      kind="info"
      iconName="checkmark.seal.fill"
      tone="gold"
      title={t('Оплата прошла')}
      subtitle={t('Подписка активируется в течение минуты — открой приложение чуть позже.')}
      primary={{ label: t('Открыть приложение'), icon: 'arrow.right', onPress: () => router.replace('/') }}
      secondary={support}>
      {checkout_id ? (
        <View style={[styles.idRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            ID:{' '}
          </ThemedText>
          <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
            {checkout_id}
          </ThemedText>
        </View>
      ) : null}
    </PurchaseStateView>
  );
}

const styles = StyleSheet.create({
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.md,
    maxWidth: '100%',
    marginTop: Spacing.two,
  },
});
