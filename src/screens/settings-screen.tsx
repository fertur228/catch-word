/**
 * Настройки / Профиль (спека §5.8).
 *
 * Секции:
 *  - ЯЗЫК           — изучаемый/родной язык (тап → лист выбора из LANGUAGES);
 *  - ГОЛОС / АКЦЕНТ — системные голоса для изучаемого языка с пред-прослушкой;
 *  - ПОДПИСКА       — текущий тариф Free, переход на Пейволл, восстановление;
 *  - О ПРИЛОЖЕНИИ   — Privacy/Terms (заглушки) и версия из expo-constants.
 *
 * Только моки: реальных покупок и аккаунтов нет (подключим слоями, §11).
 */
import { Children, Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import type { SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Reveal } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/collection-context';
import { alertAsync, confirmAsync } from '@/lib/dialog';
import { LANGUAGES, getLanguage } from '@/lib/mock-data';
import { pluralWords } from '@/lib/plural';
import { MANAGE_SUBSCRIPTION_URL, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/constants/links';

// --- Палитра «цветных кружков» под иконку строки (мягкий фон + насыщенная иконка) ---
type Tone = 'primary' | 'accent' | 'accent2' | 'success' | 'warning' | 'gold' | 'danger' | 'neutral';
const TONES: Record<Tone, { soft: ThemeColor; strong: ThemeColor }> = {
  primary: { soft: 'primarySoft', strong: 'primary' },
  accent: { soft: 'accentSoft', strong: 'accent' },
  accent2: { soft: 'accent2Soft', strong: 'accent2' },
  success: { soft: 'successSoft', strong: 'success' },
  warning: { soft: 'warningSoft', strong: 'warning' },
  gold: { soft: 'goldSoft', strong: 'gold' },
  danger: { soft: 'dangerSoft', strong: 'danger' },
  neutral: { soft: 'backgroundElement', strong: 'text' },
};

/** Пружинное «сжатие» при нажатии — общая микро-интеракция для строк/баннера. */
function usePressScale(to = 0.97) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = () => (scale.value = withSpring(to, Motion.spring.stiff));
  const onPressOut = () => (scale.value = withSpring(1, Motion.spring.bouncy));
  return { animStyle, onPressIn, onPressOut };
}

// ---------------------------------------------------------------------------
// Базовые блоки: заголовок секции + карточка-группа со строками-разделителями
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        {label}
      </ThemedText>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Сгруппированная карточка (как в iOS Settings): строки + тонкие разделители. */
function Group({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {child}
          {i < items.length - 1 ? (
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          ) : null}
        </Fragment>
      ))}
    </View>
  );
}

interface SettingRowProps {
  icon: SFSymbol;
  tone?: Tone;
  label: string;
  sublabel?: string;
  /** Текст справа (напр. язык). */
  value?: string;
  /** Произвольный элемент справа вместо текста (пилюля, чекмарк и т.п.). */
  accessory?: ReactNode;
  onPress?: () => void;
  /** Показывать шеврон «>»; по умолчанию — для навигационных строк без accessory. */
  chevron?: boolean;
}

/** Универсальная строка настроек: цветная иконка · текст · значение · шеврон. */
function SettingRow({ icon, tone = 'neutral', label, sublabel, value, accessory, onPress, chevron }: SettingRowProps) {
  const theme = useTheme();
  const t = TONES[tone];
  const press = usePressScale(0.985);
  const showChevron = chevron ?? (!!onPress && !accessory);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      onPressIn={onPress ? press.onPressIn : undefined}
      onPressOut={onPress ? press.onPressOut : undefined}>
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.row,
            press.animStyle,
            pressed && onPress ? { backgroundColor: theme.backgroundSelected } : null,
          ]}>
          <View style={[styles.rowIcon, { backgroundColor: theme[t.soft] }]}>
            <Icon name={icon} size={17} color={theme[t.strong]} />
          </View>
          <View style={styles.rowText}>
            <ThemedText type="default" style={styles.rowLabel} numberOfLines={1}>
              {label}
            </ThemedText>
            {sublabel ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {sublabel}
              </ThemedText>
            ) : null}
          </View>
          {accessory ??
            (value ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.rowValue}>
                {value}
              </ThemedText>
            ) : null)}
          {showChevron ? <Icon name="chevron.right" size={14} color={theme.textSecondary} /> : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Маленькая пилюля-тег (напр. «Free»). */
function Tag({ text, tone = 'gold' }: { text: string; tone?: Tone }) {
  const theme = useTheme();
  const t = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: theme[t.soft] }]}>
      <ThemedText type="smallBold" style={{ color: theme[t.strong] }}>
        {text}
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Экран
// ---------------------------------------------------------------------------

export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, setLanguages, cards, clearCollection } = useCollection();
  const { user, signInWithGoogle, signOut } = useAuth();

  const learning = getLanguage(prefs.learningLang);
  const native = getLanguage(prefs.nativeLang);

  // Какой язык сейчас выбираем (null — лист закрыт).
  const [picker, setPicker] = useState<null | 'learning' | 'native'>(null);

  // --- Голоса для изучаемого языка (expo-speech; всё защищено try/catch) ---
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null); // null = системный по умолчанию

  // Образец для пред-прослушки — название языка на нём самом (реальное слово).
  const sample = useMemo(() => getLanguage(prefs.learningLang).label, [prefs.learningLang]);

  useEffect(() => {
    let alive = true;
    setVoicesLoading(true);
    setSelectedVoice(null);
    (async () => {
      try {
        const all = await Speech.getAvailableVoicesAsync();
        if (!alive) return;
        const base = prefs.learningLang.split('-')[0].toLowerCase();
        const matched = all
          .filter((v) => v.language?.toLowerCase().startsWith(base))
          // Сначала «улучшенные» голоса — они звучат естественнее.
          .sort(
            (a, b) =>
              (b.quality === Speech.VoiceQuality.Enhanced ? 1 : 0) -
              (a.quality === Speech.VoiceQuality.Enhanced ? 1 : 0),
          )
          .slice(0, 4);
        setVoices(matched);
      } catch {
        if (alive) setVoices([]);
      } finally {
        if (alive) setVoicesLoading(false);
      }
    })();
    return () => {
      alive = false;
      Speech.stop();
    };
  }, [prefs.learningLang]);

  // Прослушать голос (undefined → системный голос по умолчанию).
  const preview = (voiceId?: string) => {
    Speech.stop();
    try {
      Speech.speak(sample, { language: prefs.learningLang, voice: voiceId, rate: 0.95, pitch: 1.0 });
    } catch {
      // На некоторых платформах озвучка недоступна — молча игнорируем.
    }
  };

  const stub = (title: string) => {
    void alertAsync(title, 'Заглушка для MVP — подключим позже.');
  };

  // Экспорт коллекции через системный share-sheet (заявлено в Premium).
  const onExport = () => {
    if (cards.length === 0) {
      void alertAsync('Коллекция пуста', 'Сначала поймай несколько слов камерой.');
      return;
    }
    const list = cards.map((c) => `${c.word} — ${c.translation}`).join('\n');
    Share.share({ message: `Мои слова из CatchWord (${cards.length}):\n\n${list}` }).catch(() => {});
  };

  // Очистить коллекцию ТЕКУЩЕГО курса (с подтверждением). Слова других пар не трогаем.
  const onClear = async () => {
    const ok = await confirmAsync(
      'Очистить коллекцию?',
      `Все слова пары ${learning.flag} ${learning.label} → ${native.label} ${native.flag} будут удалены без возможности восстановить. Слова других пар останутся.`,
      'Очистить',
      true,
    );
    if (ok) clearCollection();
  };

  const onSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch {
      void alertAsync('Не удалось войти', 'Попробуй ещё раз.');
    }
  };
  const onSignOut = async () => {
    const ok = await confirmAsync(
      'Выйти из аккаунта?',
      'Локальная коллекция останется на устройстве.',
      'Выйти',
      true,
    );
    if (ok) signOut();
  };

  // Выбор языка из листа.
  const chooseLanguage = (code: string) => {
    if (picker === 'learning') setLanguages(code, prefs.nativeLang);
    else if (picker === 'native') setLanguages(prefs.learningLang, code);
    setPicker(null);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <>
      <Screen scroll>
        {/* Профиль-герой: краткая сводка о языковой паре и тарифе */}
        <Reveal delay={0}>
          <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
              <Icon name="graduationcap.fill" size={26} color={theme.primary} />
            </View>
            <View style={styles.heroText}>
              <ThemedText style={styles.heroTitle} numberOfLines={1}>
                Учу {learning.label} {learning.flag}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                Родной — {native.label} {native.flag}
              </ThemedText>
            </View>
            <Tag text="Free" tone="gold" />
          </View>
        </Reveal>

        {/* АККАУНТ */}
        <Reveal delay={40}>
          <Section label="АККАУНТ">
            <Group>
              {user
                ? [
                    <SettingRow
                      key="account"
                      icon="person.crop.circle.fill"
                      tone="primary"
                      label={user.email ?? 'Аккаунт Google'}
                      sublabel="Прогресс и фото синхронизируются"
                    />,
                    <SettingRow
                      key="signout"
                      icon="rectangle.portrait.and.arrow.right"
                      tone="danger"
                      label="Выйти"
                      onPress={onSignOut}
                    />,
                  ]
                : (
                    <SettingRow
                      icon="person.crop.circle.badge.plus"
                      tone="primary"
                      label="Войти через Google"
                      sublabel="Сохрани прогресс и фото в облаке"
                      onPress={onSignIn}
                    />
                  )}
            </Group>
          </Section>
        </Reveal>

        {/* ПАРА ЯЗЫКОВ (КУРС) */}
        <Reveal delay={60}>
          <Section label="ПАРА ЯЗЫКОВ · КУРС">
            <Group>
              <SettingRow
                icon="globe"
                tone="primary"
                label="Изучаю"
                sublabel="Слова этого языка ловлю в коллекцию"
                value={`${learning.label} ${learning.flag}`}
                onPress={() => setPicker('learning')}
              />
              <SettingRow
                icon="text.bubble.fill"
                tone="accent"
                label="Родной"
                sublabel="На него показывается перевод"
                value={`${native.label} ${native.flag}`}
                onPress={() => setPicker('native')}
              />
            </Group>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              У каждой пары — своя коллекция. Сменишь пару — откроется её коллекция.
              Сейчас в паре {learning.flag} → {native.flag}: {cards.length} {pluralWords(cards.length)}.
            </ThemedText>
          </Section>
        </Reveal>

        {/* ГОЛОС / АКЦЕНТ */}
        <Reveal delay={120}>
          <Section label="ГОЛОС / АКЦЕНТ">
            <Group>
              {/* Системный голос по умолчанию — всегда доступен */}
              <SettingRow
                icon="speaker.wave.2.fill"
                tone={selectedVoice === null ? 'primary' : 'accent2'}
                label="Системный голос"
                sublabel="По умолчанию"
                onPress={() => {
                  setSelectedVoice(null);
                  preview();
                }}
                accessory={<VoiceTrailing selected={selectedVoice === null} />}
              />
              {voices.map((v) => (
                <SettingRow
                  key={v.identifier}
                  icon="waveform"
                  tone={selectedVoice === v.identifier ? 'primary' : 'accent2'}
                  label={v.name}
                  sublabel={
                    v.quality === Speech.VoiceQuality.Enhanced ? `${v.language} · Enhanced` : v.language
                  }
                  onPress={() => {
                    setSelectedVoice(v.identifier);
                    preview(v.identifier);
                  }}
                  accessory={<VoiceTrailing selected={selectedVoice === v.identifier} />}
                />
              ))}
            </Group>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              {voicesLoading
                ? 'Загружаю голоса…'
                : voices.length > 0
                  ? 'Нажми голос, чтобы услышать пример.'
                  : 'Другие голоса появятся на реальном устройстве.'}
            </ThemedText>
          </Section>
        </Reveal>

        {/* ПОДПИСКА */}
        <Reveal delay={180}>
          <Section label="ПОДПИСКА">
            <PremiumBanner onPress={() => router.push('/paywall')} />
            <Group>
              <SettingRow
                icon="star.fill"
                tone="gold"
                label="Текущий тариф"
                accessory={<Tag text="Free" tone="gold" />}
              />
              <SettingRow
                icon="arrow.clockwise"
                tone="neutral"
                label="Восстановить покупки"
                onPress={() => stub('Восстановление покупок')}
              />
              <SettingRow
                icon="creditcard.fill"
                tone="primary"
                label="Управление подпиской"
                onPress={() => Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
              />
            </Group>
          </Section>
        </Reveal>

        {/* ДАННЫЕ */}
        <Reveal delay={210}>
          <Section label="ДАННЫЕ">
            <Group>
              <SettingRow
                icon="square.and.arrow.up"
                tone="accent2"
                label="Экспортировать коллекцию"
                onPress={onExport}
              />
              <SettingRow
                icon="trash.fill"
                tone="danger"
                label="Очистить коллекцию"
                sublabel="Только текущую пару языков"
                onPress={onClear}
              />
            </Group>
          </Section>
        </Reveal>

        {/* О ПРИЛОЖЕНИИ */}
        <Reveal delay={240}>
          <Section label="О ПРИЛОЖЕНИИ">
            <Group>
              <SettingRow
                icon="lock.fill"
                tone="neutral"
                label="Политика конфиденциальности"
                onPress={() => Linking.openURL(PRIVACY_URL)}
              />
              <SettingRow
                icon="doc.text.fill"
                tone="neutral"
                label="Условия использования"
                onPress={() => Linking.openURL(TERMS_URL)}
              />
              <SettingRow
                icon="envelope.fill"
                tone="neutral"
                label="Связаться с нами"
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=CatchWord`)}
              />
              <SettingRow icon="info.circle.fill" tone="neutral" label="Версия" value={version} />
            </Group>
          </Section>
        </Reveal>

        {/* Подвал-слоган */}
        <Reveal delay={300}>
          <View style={styles.footer}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              See it. Catch it. Speak it.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerSub}>
              CatchWord · сделано с любовью в Казахстане
            </ThemedText>
          </View>
        </Reveal>
      </Screen>

      {/* Лист выбора языка (нижний модал) */}
      <LanguagePicker
        visible={picker !== null}
        title={picker === 'native' ? 'Родной язык' : 'Язык изучения'}
        currentCode={picker === 'native' ? prefs.nativeLang : prefs.learningLang}
        bottomInset={insets.bottom}
        onSelect={chooseLanguage}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

/** Правый блок строки голоса: индикатор воспроизведения + чекмарк выбранного. */
function VoiceTrailing({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.voiceTrailing}>
      <Icon name="play.fill" size={12} color={theme.textSecondary} />
      {selected ? <Icon name="checkmark" size={16} color={theme.primary} /> : null}
    </View>
  );
}

/** Яркий баннер-апселл Premium → ведёт на Пейволл. */
function PremiumBanner({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const press = usePressScale(0.97);
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Animated.View style={[styles.banner, { backgroundColor: theme.primary }, press.animStyle]}>
        <View style={[styles.bannerIcon, { backgroundColor: theme.primaryGradientTop }]}>
          <Icon name="sparkles" size={20} color={theme.onPrimary} />
        </View>
        <View style={styles.bannerText}>
          <ThemedText style={[styles.bannerTitle, { color: theme.onPrimary }]}>CatchWord Premium</ThemedText>
          <ThemedText type="small" style={{ color: theme.onPrimary, opacity: 0.85 }} numberOfLines={1}>
            Безлимит сканов · все языки · офлайн
          </ThemedText>
        </View>
        <Icon name="chevron.right" size={16} color={theme.onPrimary} />
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Нижний лист выбора языка
// ---------------------------------------------------------------------------

interface LanguagePickerProps {
  visible: boolean;
  title: string;
  currentCode: string;
  bottomInset: number;
  onSelect: (code: string) => void;
  onClose: () => void;
}

function LanguagePicker({ visible, title, currentCode, bottomInset, onSelect, onClose }: LanguagePickerProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Затемнение фона: тап вне листа — закрыть */}
        <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(180)}
          style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: bottomInset + Spacing.three }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <ThemedText type="default" style={styles.sheetTitle}>
            {title}
          </ThemedText>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetList}>
            {LANGUAGES.map((lang) => {
              const active = lang.code === currentCode;
              return (
                <LanguageOption
                  key={lang.code}
                  flag={lang.flag}
                  label={lang.label}
                  active={active}
                  onPress={() => onSelect(lang.code)}
                />
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function LanguageOption({
  flag,
  label,
  active,
  onPress,
}: {
  flag: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const press = usePressScale(0.97);
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.option,
            press.animStyle,
            { backgroundColor: active ? theme.primarySoft : pressed ? theme.backgroundSelected : 'transparent' },
          ]}>
          <ThemedText style={styles.optionFlag}>{flag}</ThemedText>
          <ThemedText type="default" style={styles.optionLabel}>
            {label}
          </ThemedText>
          {active ? <Icon name="checkmark" size={18} color={theme.primary} /> : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Герой
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' },

  // Секции и группы
  section: { gap: Spacing.two },
  sectionLabel: { marginLeft: Spacing.one, letterSpacing: 0.6 },
  sectionBody: { gap: Spacing.two },
  group: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },

  // Строка
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    minHeight: 56,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontWeight: '600' },
  rowValue: { maxWidth: 150, textAlign: 'right' },

  // Тег / пилюля
  tag: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },

  // Голоса
  voiceTrailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  hint: { marginLeft: Spacing.one },

  // Баннер Premium
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 16, fontWeight: '800' },

  // Подвал
  footer: { alignItems: 'center', gap: 2, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  footerSub: { opacity: 0.9 },

  // Модал выбора языка
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    maxHeight: '78%',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: Radius.pill,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  sheetTitle: { fontWeight: '700', fontSize: 18, marginBottom: Spacing.two, marginLeft: Spacing.one },
  sheetList: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
  optionFlag: { fontSize: 26 },
  optionLabel: { flex: 1, fontWeight: '600' },
});
