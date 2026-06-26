/**
 * Круглая кнопка-динамик 🔊 — произносит слово через `expo-speech`.
 * С лёгкой пружинной отдачей при нажатии (микро-интеракция).
 */
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Motion } from '@/constants/theme';
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Озвучить"
      onPress={() => speakWord(text, language)}
      onPressIn={() => (scale.value = withSpring(0.9, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}
      hitSlop={8}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.primarySoft,
          },
          animStyle,
        ]}>
        <Icon name="speaker.wave.2.fill" size={size * 0.46} color={theme.primary} />
      </Animated.View>
    </Pressable>
  );
}
