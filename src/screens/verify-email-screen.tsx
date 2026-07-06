/**
 * Подтверждение почты 6-значным кодом (по примеру Qustar). Приходит после
 * регистрации. Одно скрытое поле ввода + 6 ячеек-индикаторов; при вводе 6 цифр
 * код проверяется автоматически (Supabase verifyOtp, type: 'signup'). Успех →
 * создаётся сессия, гейт ведёт на онбординг.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRAND_BLUE, PrimaryButton } from '@/components/auth-kit';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';
import { useT } from '@/lib/i18n';

const LEN = 6;

export function VerifyEmailScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const mail = String(email ?? '');
  const { verifyEmailOtp, resendSignupOtp } = useAuth();

  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (value = code) => {
    if (value.length < LEN || busy) return;
    setBusy(true);
    try {
      await verifyEmailOtp(mail, value);
      // Успех — сессия поднята, дальше ведёт гейт (онбординг).
    } catch {
      setBusy(false);
      setCode('');
      void alertAsync(t('Неверный код'), t('Проверь код из письма и попробуй снова.'));
    }
  };

  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, '').slice(0, LEN);
    setCode(digits);
    if (digits.length === LEN) void submit(digits);
  };

  const onResend = async () => {
    feedbackTap();
    try {
      await resendSignupOtp(mail);
      void alertAsync(t('Отправили код'), t('Проверь почту — придёт новый 6-значный код.'));
    } catch {
      void alertAsync(t('Не получилось'), t('Попробуй чуть позже.'));
    }
  };

  return (
    <ThemedView style={[styles.root, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four }]}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityLabel={t('Назад')}>
        <Icon name="chevron.left" size={24} color={BRAND_BLUE} />
      </Pressable>

      <View style={styles.header}>
        <View style={[styles.mark, { backgroundColor: theme.primarySoft }]}>
          <Icon name="envelope.fill" size={30} color={BRAND_BLUE} />
        </View>
        <ThemedText type="subtitle" style={styles.h}>
          {t('Проверьте почту')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hsub}>
          {t('Мы отправили 6-значный код на')}
        </ThemedText>
        {mail ? (
          <ThemedText type="smallBold" style={{ color: BRAND_BLUE }}>
            {mail}
          </ThemedText>
        ) : null}
      </View>

      {/* 6 ячеек-индикаторов; реальный ввод — скрытое поле поверх. */}
      <Pressable onPress={() => inputRef.current?.focus()} style={styles.cells}>
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
        ref={inputRef}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={LEN}
        autoFocus
        textContentType="oneTimeCode"
        style={styles.hiddenInput}
      />

      <View style={styles.submit}>
        <PrimaryButton title={t('Подтвердить')} onPress={() => submit()} loading={busy} disabled={code.length < LEN} />
      </View>

      <Pressable onPress={onResend} hitSlop={8} style={styles.resend}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Не получили код?')}{' '}
        </ThemedText>
        <ThemedText type="small" style={{ color: BRAND_BLUE, fontWeight: '700' }}>
          {t('Отправить снова')}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing.four },
  back: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  header: { alignItems: 'center', gap: Spacing.one, marginTop: Spacing.three },
  mark: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  h: {},
  hsub: { textAlign: 'center', marginTop: Spacing.one },
  cells: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.five },
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
  submit: { marginTop: Spacing.five },
  resend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.four, flexWrap: 'wrap' },
});
