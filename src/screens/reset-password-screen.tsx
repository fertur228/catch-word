/**
 * Сброс пароля, шаг 2 — ввод 6-значного кода из письма + новый пароль.
 * Проверяет код (verifyOtp type:'recovery' → поднимает сессию), затем задаёт
 * новый пароль (updateUser). После успеха гейт ведёт в приложение.
 */
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField, BRAND_BLUE, PrimaryButton } from '@/components/auth-kit';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';

const LEN = 6;

export function ResetPasswordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const mail = String(email ?? '');
  const { verifyRecoveryOtp, updatePassword, sendPasswordReset } = useAuth();

  const codeRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = code.length === LEN && pass.length >= 6 && !busy;

  const onSave = async () => {
    if (busy) return;
    if (code.length < LEN) {
      void alertAsync('Введите код', 'Нужен 6-значный код из письма.');
      return;
    }
    if (pass.length < 6) {
      void alertAsync('Пароль коротковат', 'Минимум 6 символов.');
      return;
    }
    setBusy(true);
    try {
      await verifyRecoveryOtp(mail, code);
      await updatePassword(pass);
      // Сессия поднята и пароль обновлён → дальше ведёт гейт (в приложение).
    } catch {
      setBusy(false);
      setCode('');
      void alertAsync('Не удалось', 'Проверь код из письма и попробуй снова.');
    }
  };

  const onResend = async () => {
    feedbackTap();
    try {
      await sendPasswordReset(mail);
      void alertAsync('Отправили код', 'Проверь почту — придёт новый код.');
    } catch {
      void alertAsync('Не получилось', 'Попробуй чуть позже.');
    }
  };

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityLabel="Назад">
            <Icon name="chevron.left" size={24} color={BRAND_BLUE} />
          </Pressable>

          <View style={styles.header}>
            <View style={[styles.mark, { backgroundColor: theme.primarySoft }]}>
              <Icon name="lock.rotation" size={28} color={BRAND_BLUE} />
            </View>
            <ThemedText type="subtitle" style={styles.h}>
              Новый пароль
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
              Мы отправили 6-значный код на
            </ThemedText>
            {mail ? (
              <ThemedText type="smallBold" style={{ color: BRAND_BLUE }}>
                {mail}
              </ThemedText>
            ) : null}
          </View>

          {/* 6 ячеек-индикаторов; ввод — скрытое поле поверх. */}
          <Pressable onPress={() => codeRef.current?.focus()} style={styles.cells}>
            {Array.from({ length: LEN }).map((_, i) => {
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: theme.background,
                      borderColor: active || code[i] ? BRAND_BLUE : theme.border,
                    },
                  ]}>
                  <ThemedText type="title" style={styles.cellText}>
                    {code[i] ?? ''}
                  </ThemedText>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, LEN))}
            keyboardType="number-pad"
            maxLength={LEN}
            textContentType="oneTimeCode"
            style={styles.hiddenInput}
          />

          <View style={styles.passField}>
            <AuthField
              label="Новый пароль"
              value={pass}
              onChangeText={setPass}
              placeholder="Минимум 6 символов"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onSave}
            />
          </View>

          <View style={styles.submit}>
            <PrimaryButton title="Сохранить пароль" onPress={onSave} loading={busy} disabled={!canSubmit} />
          </View>

          <Pressable onPress={onResend} hitSlop={8} style={styles.resend}>
            <ThemedText type="small" themeColor="textSecondary">
              Не получили код?{' '}
            </ThemedText>
            <ThemedText type="small" style={{ color: BRAND_BLUE, fontWeight: '700' }}>
              Отправить снова
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.four },
  back: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  header: { alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
  mark: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  h: {},
  sub: { textAlign: 'center', marginTop: Spacing.one },
  cells: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.four },
  cell: {
    width: 48,
    height: 58,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 26 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  passField: { marginTop: Spacing.five },
  submit: { marginTop: Spacing.four },
  resend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.four, flexWrap: 'wrap' },
});
