/**
 * Онбординг (спека §5.1) — тёплое приветствие в стиле CapWords.
 *
 * 5 вступительных «слайдов» (мир→словарь, лови, коллекция, освоение, привычка) +
 * шаг выбора языков. Навигация по шагам — простой
 * индекс (без сторонних карусельных либ); контент при смене шага «въезжает»
 * через reanimated. На последнем шаге «Начать» сохраняет языки, отмечает
 * онбординг пройденным и уходит на вкладки (гейт в _layout пускает дальше).
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInLeft,
  FadeInRight,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { feedbackSelection } from '@/lib/feedback';
import { useT } from '@/lib/i18n';
import { useCollection } from '@/lib/collection-context';
import { LANGUAGES, LEARNING_LANG, NATIVE_LANG, getLanguage } from '@/lib/mock-data';
import type { AppLanguage } from '@/types';

/** Вступительные слайды (большие дружелюбные визуалы + короткий текст). */
const SLIDES = [
  {
    title: 'Весь мир —\nтвой словарь',
    description: 'Любой предмет вокруг — это новое слово. Учись там, где живёшь.',
  },
  {
    title: 'Навёл →\nпоймал слово',
    description: 'Наведи камеру на вещь — поймай слово, перевод и произношение.',
  },
  {
    title: 'Собирай\nколлекцию',
    description: 'Слова копятся стикерами. Листай их по датам или по темам.',
  },
  {
    title: 'Учи и отмечай\nвыученные',
    description: 'Слова вовремя всплывают на повторение. Освоил — горит золотой значок.',
  },
  {
    title: 'Заходи\nкаждый день',
    description: 'Квест дня и серия дней подряд не дают забросить.',
  },
] as const;

/** Всего шагов: слайды + один шаг выбора языков. */
const TOTAL = SLIDES.length + 1;

export function OnboardingScreen() {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setLanguages, completeOnboarding } = useCollection();

  const reduce = useReduceMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1); // направление перехода (для анимации въезда)
  const [learning, setLearning] = useState(LEARNING_LANG); // по умолчанию English
  const [native, setNative] = useState(NATIVE_LANG); // по умолчанию Русский
  const [busy, setBusy] = useState(false);

  const isLanguageStep = step === TOTAL - 1;

  // «Дышащая» финальная кнопка на шаге выбора языка — приглашает начать.
  const ctaPulse = useSharedValue(1);
  useEffect(() => {
    if (isLanguageStep && !reduce) {
      ctaPulse.value = withRepeat(
        withSequence(withTiming(1.03, { duration: 900 }), withTiming(1, { duration: 900 })),
        -1,
        false,
      );
    } else {
      ctaPulse.value = withTiming(1, { duration: 200 });
    }
  }, [isLanguageStep, reduce, ctaPulse]);
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaPulse.value }] }));

  const goNext = () => {
    if (isLanguageStep) {
      void finish();
    } else {
      setDir(1);
      setStep((s) => s + 1);
    }
  };
  const goBack = () => {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  };
  const skip = () => {
    setDir(1);
    setStep(TOTAL - 1);
  };

  // Финал: сохранить языки → отметить онбординг → уйти на вкладки.
  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      await setLanguages(learning, native);
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch {
      setBusy(false); // дать пользователю попробовать снова
    }
  }

  // Контент шага «въезжает» по направлению навигации.
  const entering = dir >= 0 ? FadeInRight : FadeInLeft;

  const ctaTitle = isLanguageStep ? t('Начать') : step === SLIDES.length - 1 ? t('Выбрать языки') : t('Далее');

  return (
    <ThemedView
      style={[styles.root, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.three }]}>
      {/* Верхняя панель: назад (со 2-го шага) и «Пропустить» (на слайдах). */}
      <View style={styles.topBar}>
        {step > 0 ? (
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Назад')}>
            <Icon name="chevron.left" size={22} color={theme.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
        {!isLanguageStep ? (
          <Pressable onPress={skip} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Пропустить')}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Пропустить')}
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      {/* Контентная зона: перерисовывается по ключу шага, поэтому анимация играет заново. */}
      <Animated.View key={step} entering={entering.duration(Motion.duration.base)} style={styles.stepFill}>
        {isLanguageStep ? (
          <LanguageStep
            learning={learning}
            native={native}
            onLearning={setLearning}
            onNative={setNative}
          />
        ) : (
          <IntroStep index={step} />
        )}
      </Animated.View>

      {/* Низ: точки-индикаторы + основная кнопка. */}
      <View style={styles.bottom}>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <Animated.View
              key={i}
              layout={LinearTransition.duration(Motion.duration.base)}
              style={[
                styles.dot,
                { width: i === step ? 22 : 8, backgroundColor: i === step ? theme.primary : theme.border },
              ]}
            />
          ))}
        </View>
        <Animated.View style={ctaStyle}>
          <Button title={ctaTitle} onPress={goNext} loading={busy} icon={isLanguageStep ? 'sparkles' : 'arrow.right'} />
        </Animated.View>
      </View>
    </ThemedView>
  );
}

/* ───────────────────────── Слайды ───────────────────────── */

/** Один вступительный слайд: большой визуал + заголовок + описание. */
function IntroStep({ index }: { index: number }) {
  const t = useT();
  const slide = SLIDES[index];
  return (
    <View style={styles.introWrap}>
      <Hero index={index} />
      <View style={styles.copy}>
        <ThemedText type="subtitle" style={styles.title}>
          {t(slide.title)}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.desc}>
          {t(slide.description)}
        </ThemedText>
      </View>
    </View>
  );
}

/** Большой дружелюбный визуал слайда (с лёгким «покачиванием» стикеров). */
function Hero({ index }: { index: number }) {
  const theme = useTheme();
  const t = useT();
  // Бесконечное мягкое покачивание вверх-вниз — приятная микроанимация.
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * float.value }] }));

  if (index === 0) {
    // Глобус-словарь с «орбитой» из предметов.
    return (
      <View style={styles.hero}>
        <View style={[styles.orbitItem, { top: 6, left: 0 }]}>
          <Sticker category="Еда" size={50} />
        </View>
        <View style={[styles.orbitItem, { top: 28, right: 4 }]}>
          <Sticker category="Напитки" size={50} />
        </View>
        <View style={[styles.orbitItem, { bottom: 22, left: 14 }]}>
          <Sticker category="Природа" size={50} />
        </View>
        <View style={[styles.orbitItem, { bottom: 2, right: 18 }]}>
          <Sticker category="Транспорт" size={50} />
        </View>
        <Animated.View style={floatStyle}>
          <Sticker symbol="globe" tone="primary" size={144} />
        </Animated.View>
      </View>
    );
  }

  if (index === 1) {
    // «Видоискатель»: предмет в пунктирной рамке + бейдж «Поймал!».
    return (
      <View style={styles.hero}>
        <View style={styles.catchWrap}>
          <View style={[styles.frame, { borderColor: theme.primary }]}>
            <Animated.View style={floatStyle}>
              <Sticker category="Еда" size={120} />
            </Animated.View>
          </View>
          <View style={[styles.caught, { backgroundColor: theme.accent }]}>
            <Icon name="sparkles" size={14} color={theme.onPrimary} />
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              {t('Поймал: apple')}
            </ThemedText>
          </View>
        </View>
      </View>
    );
  }

  if (index === 2) {
    // Шаг 2: коллекция-скрапбук + подсказка о двух сортировках (даты/темы).
    return (
      <View style={styles.hero}>
        <Animated.View style={[styles.grid, floatStyle]}>
          <Sticker category="Еда" size={72} />
          <Sticker category="Напитки" size={72} />
          <Sticker category="Животные" size={72} />
          <Sticker category="Транспорт" size={72} />
        </Animated.View>
        <View style={[styles.cornerPill, styles.pillTopLeft, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
          <Icon name="calendar" size={13} color={theme.primary} />
          <ThemedText type="smallBold">{t('По датам')}</ThemedText>
        </View>
        <View style={[styles.cornerPill, styles.pillBottomRight, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
          <Icon name="square.grid.2x2.fill" size={13} color={theme.accent2} />
          <ThemedText type="smallBold">{t('По темам')}</ThemedText>
        </View>
      </View>
    );
  }

  if (index === 3) {
    // Шаг 3: освоение — стикер с золотым значком «выучено», звёзды и время повтора.
    return (
      <View style={styles.hero}>
        <View style={styles.masteryWrap}>
          <Animated.View style={[styles.stickerBadgeWrap, floatStyle]}>
            <Sticker category="Еда" size={120} />
            <View style={[styles.heroBadge, { backgroundColor: theme.card }]}>
              <Icon name="checkmark.seal.fill" size={32} color={theme.gold} />
            </View>
          </Animated.View>
          <View style={styles.stars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Icon key={i} name={i < 4 ? 'star.fill' : 'star'} size={20} color={i < 4 ? theme.gold : theme.border} />
            ))}
          </View>
          <View style={[styles.infoPill, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Icon name="clock" size={13} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {t('Повтор через 2 часа')}
            </ThemedText>
          </View>
        </View>
      </View>
    );
  }

  // Шаг 4: привычка — карточка квеста дня + бейдж серии (streak).
  return (
    <View style={styles.hero}>
      <Animated.View
        style={[styles.questCard, floatStyle, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
        <View style={[styles.questIcon, { backgroundColor: theme.accentSoft }]}>
          <Icon name="target" size={26} color={theme.accent} />
        </View>
        <View style={styles.questText}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Квест дня')}
          </ThemedText>
          <ThemedText type="smallBold">{t('Найди дерево')}</ThemedText>
        </View>
      </Animated.View>
      <View style={[styles.streak, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
        <Icon name="flame.fill" size={15} color={theme.gold} />
        <ThemedText type="smallBold">{t('5 дней')}</ThemedText>
      </View>
    </View>
  );
}

/* ─────────────────────── Выбор языков ─────────────────────── */

/** Шаг выбора языков: «учу» и «родной» (с флагами, дефолты English ← Русский). */
function LanguageStep({
  learning,
  native,
  onLearning,
  onNative,
}: {
  learning: string;
  native: string;
  onLearning: (code: string) => void;
  onNative: (code: string) => void;
}) {
  const t = useT();
  return (
    <ScrollView style={styles.stepFill} contentContainerStyle={styles.langContent} showsVerticalScrollIndicator={false}>
      <View style={styles.langHeader}>
        <Sticker symbol="bubble.left.and.bubble.right.fill" tone="primary" size={84} />
        <ThemedText type="subtitle" style={styles.title}>
          {t('Твои языки')}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.desc}>
          {t('Что учим и на каком языке показывать перевод.')}
        </ThemedText>
      </View>

      <LangRow label={t('Я учу')} selectedCode={learning} onSelect={onLearning} />
      <LangRow label={t('Мой язык')} selectedCode={native} onSelect={onNative} />

      <SummaryCard learning={learning} native={native} />
    </ScrollView>
  );
}

/** Строка выбора языка: подпись + горизонтальная лента флаг-чипов. */
function LangRow({
  label,
  selectedCode,
  onSelect,
}: {
  label: string;
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  return (
    <View style={styles.langRow}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.langRowLabel}>
        {label}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.langScroll}
        contentContainerStyle={styles.langScrollContent}>
        {LANGUAGES.map((lang) => (
          <LangOption
            key={lang.code}
            lang={lang}
            selected={lang.code === selectedCode}
            onPress={() => onSelect(lang.code)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Чип языка: флаг + название, подсветка при выборе, пружинка при нажатии. */
function LangOption({
  lang,
  selected,
  onPress,
}: {
  lang: AppLanguage;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = selected ? theme.primary : theme.backgroundElement;
  const fg = selected ? theme.onPrimary : theme.text;

  return (
    <Pressable
      onPress={() => {
        feedbackSelection();
        onPress();
      }}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <Animated.View
        style={[
          styles.langOption,
          { backgroundColor: bg, borderColor: selected ? theme.primary : theme.border },
          animStyle,
        ]}>
        <Text style={styles.flag}>{lang.flag}</Text>
        <ThemedText type="smallBold" style={{ color: fg }}>
          {lang.label}
        </ThemedText>
        {selected ? (
          <Animated.View entering={ZoomIn.springify().damping(12).stiffness(220)}>
            <Icon name="checkmark" size={15} color={fg} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** Итоговая карточка «учу → родной» — наглядно показывает выбор. */
function SummaryCard({ learning, native }: { learning: string; native: string }) {
  const theme = useTheme();
  const from = getLanguage(learning);
  const to = getLanguage(native);
  return (
    <View style={[styles.summary, { backgroundColor: theme.primarySoft }]}>
      <Text style={styles.flag}>{from.flag}</Text>
      <ThemedText type="smallBold" themeColor="primary">
        {from.label}
      </ThemedText>
      <Icon name="arrow.right" size={16} color={theme.primary} />
      <Text style={styles.flag}>{to.flag}</Text>
      <ThemedText type="smallBold" themeColor="primary">
        {to.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing.four },
  topBar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSpacer: { width: 22, height: 22 },
  stepFill: { flex: 1 },

  // --- Слайды ---
  introWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.five },
  copy: { alignItems: 'center', gap: Spacing.three },
  title: { textAlign: 'center' },
  desc: { textAlign: 'center', maxWidth: 320 },

  // --- Hero-визуалы ---
  hero: { height: 260, width: '100%', alignItems: 'center', justifyContent: 'center' },
  orbitItem: { position: 'absolute' },
  catchWrap: { alignItems: 'center', gap: Spacing.three },
  frame: {
    width: 220,
    height: 200,
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caught: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  grid: { width: 172, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two },
  // Угловые пилюли-подсказки (слайд «коллекция»: По датам / По темам).
  cornerPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  pillTopLeft: { top: 18, left: 0 },
  pillBottomRight: { bottom: 12, right: 0 },
  // Слайд «освоение»: стикер с золотым значком + звёзды + время повтора.
  masteryWrap: { alignItems: 'center', gap: Spacing.three },
  stickerBadgeWrap: { width: 120, height: 120 },
  heroBadge: { position: 'absolute', top: -8, right: -8, borderRadius: Radius.pill, padding: 2 },
  stars: { flexDirection: 'row', gap: Spacing.one },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  // Слайд «привычка»: карточка квеста дня.
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    maxWidth: 260,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
  },
  questIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  questText: { gap: 2 },
  streak: {
    position: 'absolute',
    top: 18,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },

  // --- Выбор языков ---
  langContent: { flexGrow: 1, justifyContent: 'center', gap: Spacing.four, paddingVertical: Spacing.three },
  langHeader: { alignItems: 'center', gap: Spacing.three },
  langRow: { gap: Spacing.two },
  langRowLabel: { letterSpacing: 0.3 },
  langScroll: { marginHorizontal: -Spacing.four }, // лента флагов бьёт в края экрана
  langScrollContent: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  flag: { fontSize: 20 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.lg,
  },

  // --- Низ ---
  bottom: { gap: Spacing.three, paddingTop: Spacing.two },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  dot: { height: 8, borderRadius: Radius.pill },
});
