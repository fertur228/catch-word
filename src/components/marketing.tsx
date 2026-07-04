/**
 * Каркас маркетинговых (лендинг) страниц: верхняя панель с логотипом и входом,
 * центрированный контейнер с максимальной шириной, футер со ссылками.
 * Используется на /welcome, /pricing, /privacy, /terms. Только веб, но собран
 * из общих themed-компонентов — единый стиль с приложением.
 */
import type { ReactNode } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Link, useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/constants/links';

const MAX_WIDTH = 1080;

/** Десктопная ли ширина (для двух-колоночных раскладок). */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= 900;
}

/** Центрированный контейнер контента с боковыми полями. */
export function Container({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.container, style]}>{children}</View>;
}

/** Кнопка входа через Google (общая для топбара и hero). */
export function GoogleButton({ title = 'Войти через Google' }: { title?: string }) {
  const { signInWithGoogle } = useAuth();
  const onPress = () => {
    void signInWithGoogle().catch(() => {});
  };
  return <Button title={title} icon="person.crop.circle.badge.plus" onPress={onPress} />;
}

function TopBar() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useIsWide();
  const { session } = useAuth();
  const { signInWithGoogle } = useAuth();

  return (
    <View style={[styles.topbar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <Container style={styles.topbarRow}>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/welcome')}
          style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: theme.primary }]}>
            <Icon name="camera.fill" size={18} color={theme.onPrimary} />
          </View>
          <ThemedText style={styles.brandName}>TakeWord</ThemedText>
        </Pressable>

        <View style={styles.topbarRight}>
          {wide ? (
            <Link href="/pricing" asChild>
              <Pressable hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Тарифы
                </ThemedText>
              </Pressable>
            </Link>
          ) : null}
          {session ? (
            <Button title="Открыть приложение" icon="arrow.right" onPress={() => router.replace('/')} />
          ) : (
            <Button
              title="Войти"
              variant="secondary"
              icon="person.crop.circle.badge.plus"
              onPress={() => void signInWithGoogle().catch(() => {})}
            />
          )}
        </View>
      </Container>
    </View>
  );
}

function Footer() {
  const theme = useTheme();
  const year = new Date().getFullYear();
  return (
    <View style={[styles.footer, { borderTopColor: theme.border }]}>
      <Container style={styles.footerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          © {year} TakeWord
        </ThemedText>
        <View style={styles.footerLinks}>
          <Link href="/pricing" asChild>
            <Pressable hitSlop={6}>
              <ThemedText type="small" themeColor="textSecondary">
                Тарифы
              </ThemedText>
            </Pressable>
          </Link>
          <Pressable hitSlop={6} onPress={() => Linking.openURL(PRIVACY_URL)}>
            <ThemedText type="small" themeColor="textSecondary">
              Конфиденциальность
            </ThemedText>
          </Pressable>
          <Pressable hitSlop={6} onPress={() => Linking.openURL(TERMS_URL)}>
            <ThemedText type="small" themeColor="textSecondary">
              Условия
            </ThemedText>
          </Pressable>
          <Pressable hitSlop={6} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            <ThemedText type="small" themeColor="textSecondary">
              Поддержка
            </ThemedText>
          </Pressable>
        </View>
      </Container>
    </View>
  );
}

/** Оболочка страницы: фикс-топбар + прокручиваемый контент + футер. */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.flex}>
      <TopBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {children}
        <Footer />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  container: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  topbar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.three },
  topbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.five, marginTop: Spacing.six },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, flexWrap: 'wrap' },
});
