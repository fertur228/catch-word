/**
 * Шаг регистрации: имя и фамилия в отдельных ячейках. Показывается один раз —
 * сразу после первого входа (Apple/Google), до онбординга. Предзаполняется
 * именем из аккаунта провайдера, если оно пришло. Сохраняет в профиль аккаунта
 * (метаданные пользователя, флаг `profile_completed`) и уходит на онбординг.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/collection-context';
import { alertAsync } from '@/lib/dialog';

/** Достаём имя/фамилию из метаданных провайдера (Google/Apple), если пришли. */
function guessName(meta: Record<string, any> | undefined): { first: string; last: string } {
  if (!meta) return { first: '', last: '' };
  const first = (meta.given_name ?? meta.first_name ?? '') as string;
  const last = (meta.family_name ?? meta.last_name ?? '') as string;
  if (first || last) return { first, last };
  const full = String(meta.full_name ?? meta.name ?? '').trim();
  if (!full) return { first: '', last: '' };
  const parts = full.split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export function CompleteProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateProfileName } = useAuth();
  const { prefs } = useCollection();

  const [{ first: initFirst, last: initLast }] = useState(() => guessName(user?.user_metadata));
  const [first, setFirst] = useState(initFirst);
  const [last, setLast] = useState(initLast);
  const [busy, setBusy] = useState(false);

  const canSubmit = first.trim().length > 0 && !busy;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await updateProfileName(first, last);
      router.replace(prefs.onboarded ? '/(tabs)' : '/onboarding');
    } catch {
      setBusy(false);
      void alertAsync('Не удалось сохранить', 'Проверь соединение и попробуй ещё раз.');
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border },
  ];

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View
          style={[
            styles.content,
            { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.four },
          ]}>
          <View style={[styles.mark, { backgroundColor: theme.primarySoft }]}>
            <Icon name="person.fill" size={30} color={theme.primary} />
          </View>
          <ThemedText type="subtitle" style={styles.title}>
            Как тебя зовут?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Чтобы обращаться по имени. Позже можно поменять в настройках.
          </ThemedText>

          <View style={styles.fields}>
            <View style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                Имя
              </ThemedText>
              <TextInput
                style={inputStyle}
                value={first}
                onChangeText={setFirst}
                placeholder="Иван"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                autoComplete="name-given"
                textContentType="givenName"
                returnKeyType="next"
              />
            </View>
            <View style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                Фамилия
              </ThemedText>
              <TextInput
                style={inputStyle}
                value={last}
                onChangeText={setLast}
                placeholder="Иванов"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                autoComplete="name-family"
                textContentType="familyName"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
            </View>
          </View>

          <View style={styles.spacer} />
          <Button title="Продолжить" icon="arrow.right" onPress={onSubmit} loading={busy} disabled={!canSubmit} />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: Spacing.four },
  mark: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: {},
  sub: { marginTop: Spacing.one, maxWidth: 320 },
  fields: { gap: Spacing.three, marginTop: Spacing.five },
  field: { gap: Spacing.one },
  label: { letterSpacing: 0.3, marginLeft: Spacing.one },
  input: {
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
  },
  spacer: { flex: 1 },
});
