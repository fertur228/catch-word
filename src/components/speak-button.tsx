/**
 * Круглая кнопка-динамик 🔊 — произносит слово через `expo-speech`.
 */
import { Pressable } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { speakWord } from '@/lib/speech';

interface SpeakButtonProps {
  /** Что произнести. */
  text: string;
  /** Язык/акцент (BCP-47), напр. 'en-US'. */
  language?: string;
  size?: number;
}

export function SpeakButton({ text, language, size = 48 }: SpeakButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Озвучить"
      onPress={() => speakWord(text, language)}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.primarySoft,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Icon name="speaker.wave.2.fill" size={size * 0.46} color={theme.primary} />
    </Pressable>
  );
}
