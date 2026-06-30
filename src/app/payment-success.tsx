/**
 * Страница успешной оплаты — DodoPayments редиректит сюда после оплаты.
 * URL: /payment-success?payment_id=...&subscription_id=...
 *
 * Реальная активация подписки происходит через webhook (Supabase Edge Function)
 * — эта страница только показывает подтверждение пользователю.
 */
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from '@/components/icon';

export default function PaymentSuccess() {
  const theme = useTheme();
  const router = useRouter();
  const { subscription_id, payment_id } = useLocalSearchParams<{
    subscription_id?: string;
    payment_id?: string;
  }>();

  const id = subscription_id ?? payment_id;

  return (
    <ThemedView style={styles.root}>
      <View style={styles.card}>
        <View style={[styles.icon, { backgroundColor: theme.successSoft }]}>
          <Icon name="checkmark.circle.fill" size={48} color={theme.success} />
        </View>

        <ThemedText style={styles.title}>Оплата прошла!</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
          Подписка активируется в течение нескольких секунд.{'\n'}
          Если что-то пошло не так — напиши нам.
        </ThemedText>

        {id ? (
          <View style={[styles.idRow, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">ID: </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
              {id}
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
              window.location.href = 'mailto:nodes.kazakhstan@gmail.com?subject=CatchWord Premium';
            }
          }}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: Spacing.three,
  },
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
