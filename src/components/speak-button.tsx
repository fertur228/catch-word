/**
 * Кнопка-динамик произношения. Обычная (🔊) и медленная (🐢 «черепаха», как в
 * Duolingo — для тренировки произношения). Пока говорит — подсвечивается и
 * пускает «сонар»-кольцо; при нажатии — лёгкая пружинная отдача.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { speakWord, SPEECH_RATE } from '@/lib/speech';

interface SpeakButtonProps {
  /** Что произнести. */
  text: string;
  /** Язык/акцент (BCP-47), напр. 'en-US'. */
  language?: string;
  size?: number;
  /** Медленное произношение (как «черепаха» в Duolingo). */
  slow?: boolean;
}

export function SpeakButton({ text, language, size = 48, slow = false }: SpeakButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => cancelAnimation(ring), [ring]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 1], [0.45, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [1, 1.9]) }],
  }));

  const onPress = () => {
    speakWord(text, language, {
      rate: slow ? SPEECH_RATE.slow : SPEECH_RATE.normal,
      onStart: () => {
        setSpeaking(true);
        ring.value = 0;
        ring.value = withRepeat(
          withTiming(1, { duration: 900, easing: Easing.out(Easing.ease) }),
          -1,
          false,
        );
      },
      onDone: () => {
        setSpeaking(false);
        cancelAnimation(ring);
        ring.value = withTiming(0, { duration: 120 });
      },
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={slow ? 'Произнести медленно' : 'Озвучить произношение'}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.9, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}
      hitSlop={8}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* «Сонар»-кольцо, пока говорит. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: theme.primary }, ringStyle]}
        />
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: speaking ? theme.primary : theme.primarySoft,
            },
            animStyle,
          ]}>
          <Icon
            name={slow ? 'tortoise.fill' : 'speaker.wave.2.fill'}
            size={size * 0.46}
            color={speaking ? theme.onPrimary : theme.primary}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}
