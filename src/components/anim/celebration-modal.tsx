/**
 * CelebrationModal — модалка-празднование вехи (7-дневный стрик, N выученных
 * слов, идеальная сессия). Затемнение + «выскакивающий» бейдж + конфетти +
 * success-хаптика. Переиспользует примитивы Confetti и Pop.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Confetti } from '@/components/anim/confetti';
import { Pop } from '@/components/anim/pop';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import type { ThemeColor } from '@/constants/theme';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedbackCorrect } from '@/lib/feedback';

export function CelebrationModal({
  visible,
  title,
  subtitle,
  icon = 'star.fill',
  tone = 'gold',
  ctaLabel = 'Отлично!',
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  icon?: SFSymbol;
  tone?: ThemeColor;
  ctaLabel?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [burst, setBurst] = useState(0);
  const shown = useRef(false);

  useEffect(() => {
    if (visible && !shown.current) {
      shown.current = true;
      setBurst((b) => b + 1);
      feedbackCorrect();
    }
    if (!visible) shown.current = false;
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Confetti trigger={burst} count={26} originTop="38%" />
        <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pop from={0.4} spring="celebration">
            <View style={[styles.badge, { backgroundColor: theme[`${tone}Soft` as ThemeColor] ?? theme.goldSoft }]}>
              <Icon name={icon} size={44} color={theme[tone]} />
            </View>
          </Pop>
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
          <Button title={ctaLabel} onPress={onClose} style={styles.cta} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: Spacing.two },
  cta: { alignSelf: 'stretch', marginTop: Spacing.four },
});
