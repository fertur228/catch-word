/**
 * Лендинг CatchWord (/welcome) — минимальная входная страница.
 * Логотип · заголовок · две кнопки (войти / зарегистрироваться через Google) · гость.
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { setGuest } from '@/lib/web-guest';

export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const { signInWithGoogle } = useAuth();

  const onGoogle = () => void signInWithGoogle().catch(() => {});

  const onGuest = () => {
    setGuest(true);
    router.replace('/');
  };

  return (
    <ThemedView style={styles.root}>
      <Head>
        <title>CatchWord — учи язык через камеру</title>
        <meta name="description" content="Наведи камеру на предмет — поймай слово, перевод и карточку." />
      </Head>

      <View style={styles.center}>
        {/* Логотип */}
        <View style={[styles.logo, { backgroundColor: theme.primary }]}>
          <Icon name="camera.fill" size={36} color={theme.onPrimary} />
        </View>

        <ThemedText style={styles.title}>CatchWord</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
          Учи язык через камеру — наведи на предмет и поймай слово
        </ThemedText>

        {/* Кнопки */}
        <View style={styles.buttons}>
          <Button
            title="Зарегистрироваться через Google"
            icon="person.crop.circle.badge.plus"
            onPress={onGoogle}
          />
          <Button
            title="Войти через Google"
            variant="secondary"
            icon="person.crop.circle.fill"
            onPress={onGoogle}
          />
        </View>

        {/* Гость */}
        <Button
          title="Попробовать без аккаунта"
          variant="ghost"
          icon="arrow.right"
          onPress={onGuest}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  sub: { textAlign: 'center', fontSize: 16, lineHeight: 24, marginBottom: Spacing.two },
  buttons: { width: '100%', gap: Spacing.two },
});
