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
import { Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
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
import { Toast } from '@/components/toast';
import { Motion, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedbackSelection } from '@/lib/feedback';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/collection-context';
import { useSubscription } from '@/lib/subscription';
import { alertAsync, confirmAsync } from '@/lib/dialog';
import { LANGUAGES, getLanguage } from '@/lib/mock-data';
import { MANAGE_SUBSCRIPTION_URL, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/constants/links';
import { setGuest } from '@/lib/web-guest';

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
  // Монохром-графит: плитки иконок нейтрально-серые; цвет только у деструктивных
  // (danger = красный) — так по HIG цвет несёт смысл, а не украшает.
  const isDanger = tone === 'danger';
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
          <View style={[styles.rowIcon, { backgroundColor: isDanger ? theme.dangerSoft : theme.backgroundSelected }]}>
            <Icon name={icon} size={17} color={isDanger ? theme.danger : theme.text} />
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
  const { prefs, setLanguages, cards, clearCollection, scansLeft, scanLimit } = useCollection();
  const { user, signInWithGoogle, signOut } = useAuth();
  const { isPremium, status, loading: subLoading } = useSubscription();

  // Ярлык тарифа для «пилюли»: Premium (активен/пробный) или Free.
  const planLabel = isPremium ? (status === 'trialing' ? 'Premium · пробный' : 'Premium') : 'Free';
  const planTone: Tone = isPremium ? 'primary' : 'gold';

  const learning = getLanguage(prefs.learningLang);
  const native = getLanguage(prefs.nativeLang);

  // Какой язык сейчас выбираем (null — лист закрыт).
  const [picker, setPicker] = useState<null | 'learning' | 'native'>(null);

  // --- Голоса для изучаемого языка (expo-speech; всё защищено try/catch) ---
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null); // null = системный по умолчанию
  const [voiceOpen, setVoiceOpen] = useState(false); // открыт ли лист выбора голоса
  const [toast, setToast] = useState<string | null>(null); // короткое подтверждение действий

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
    if (ok) {
      setGuest(false);
      await signOut();
    }
  };

  // Выбор языка из листа — с тактильным откликом и тостом-подтверждением.
  const chooseLanguage = (code: string) => {
    feedbackSelection();
    if (picker === 'learning') setLanguages(code, prefs.nativeLang);
    else if (picker === 'native') setLanguages(prefs.learningLang, code);
    setPicker(null);
    setToast(`${picker === 'native' ? 'Родной язык' : 'Язык изучения'}: ${getLanguage(code).label}`);
  };

  // Имя текущего голоса для строки «Голос» (свёрнутый список → лист выбора).
  const currentVoiceName =
    selectedVoice === null
      ? 'Системный'
      : voices.find((v) => v.identifier === selectedVoice)?.name ?? 'Системный';

  // Выбор голоса из листа: выбираем и сразу проигрываем пример (лист не закрываем —
  // можно попробовать несколько подряд).
  const chooseVoice = (id: string | null) => {
    feedbackSelection();
    setSelectedVoice(id);
    preview(id ?? undefined);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <>
      <Screen scroll>
        {/* Профиль-герой */}
        <Reveal delay={0}>
          <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
              {user?.user_metadata?.avatar_url ? (
                <Image
                  source={{ uri: user.user_metadata.avatar_url as string }}
                  style={styles.avatarImage}
                />
              ) : (
                <Icon name={user ? 'person.crop.circle.fill' : 'graduationcap.fill'} size={26} color={theme.primary} />
              )}
            </View>
            <View style={styles.heroText}>
              {user ? (
                <>
                  <ThemedText style={styles.heroTitle} numberOfLines={1}>
                    {(user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Профиль'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {user.email}
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText style={styles.heroTitle} numberOfLines={1}>
                    Учу {learning.label} {learning.flag}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    Родной — {native.label} {native.flag}
                  </ThemedText>
                </>
              )}
            </View>
            <Tag text={planLabel} tone={planTone} />
          </View>
        </Reveal>

        {/* АККАУНТ — только для гостя (вход). У вошедшего email виден в шапке. */}
        {!user ? (
          <Reveal delay={40}>
            <Section label="АККАУНТ">
              <Group>
                <SettingRow
                  icon="person.crop.circle.badge.plus"
                  label="Войти через Google"
                  sublabel="Сохрани прогресс и фото в облаке"
                  onPress={onSignIn}
                />
              </Group>
            </Section>
          </Reveal>
        ) : null}

        {/* КУРС: языки + голос — всё про изучаемый язык одной группой */}
        <Reveal delay={60}>
          <Section label="КУРС">
            <Group>
              <SettingRow
                icon="globe"
                label="Изучаю"
                value={`${learning.label} ${learning.flag}`}
                onPress={() => setPicker('learning')}
              />
              <SettingRow
                icon="text.bubble.fill"
                label="Родной"
                value={`${native.label} ${native.flag}`}
                onPress={() => setPicker('native')}
              />
              <SettingRow
                icon="speaker.wave.2.fill"
                label="Голос"
                value={currentVoiceName}
                onPress={() => setVoiceOpen(true)}
              />
            </Group>
          </Section>
        </Reveal>

        {/* PREMIUM: апселл + сканы + управление подпиской */}
        <Reveal delay={120}>
          <Section label="PREMIUM">
            {/* Баннер апселла — только когда статус подписки уже известен,
                иначе Premium-юзер на первом старте увидит его на миг. */}
            {!isPremium && !subLoading ? <PremiumBanner onPress={() => router.push('/paywall')} /> : null}
            <Group>
              <SettingRow
                icon="bolt.fill"
                label="Сканы"
                sublabel={!isPremium && scansLeft === 0 ? 'Лимит исчерпан' : undefined}
                accessory={
                  isPremium ? (
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      Неограниченно
                    </ThemedText>
                  ) : (
                    <View style={styles.scansAccessory}>
                      <ThemedText type="smallBold" style={{ color: scansLeft === 0 ? theme.danger : theme.text }}>
                        {scansLeft}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        /{scanLimit}
                      </ThemedText>
                    </View>
                  )
                }
              />
              <SettingRow
                icon="arrow.clockwise"
                label="Восстановить покупки"
                onPress={() => stub('Восстановление покупок')}
              />
              <SettingRow
                icon="creditcard.fill"
                label="Управление подпиской"
                onPress={() => Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
              />
            </Group>
          </Section>
        </Reveal>

        {/* ДОПОЛНИТЕЛЬНО: данные + информация */}
        <Reveal delay={180}>
          <Section label="ДОПОЛНИТЕЛЬНО">
            <Group>
              <SettingRow icon="square.and.arrow.up" label="Экспортировать коллекцию" onPress={onExport} />
              <SettingRow
                icon="trash.fill"
                tone="danger"
                label="Очистить коллекцию"
                sublabel="Только текущую пару"
                onPress={onClear}
              />
              <SettingRow icon="lock.fill" label="Конфиденциальность" onPress={() => Linking.openURL(PRIVACY_URL)} />
              <SettingRow icon="doc.text.fill" label="Условия использования" onPress={() => Linking.openURL(TERMS_URL)} />
              <SettingRow
                icon="envelope.fill"
                label="Связаться с нами"
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=CatchWord`)}
              />
            </Group>
          </Section>
        </Reveal>

        {/* Выйти — отдельной красной строкой внизу (для вошедших) */}
        {user ? (
          <Reveal delay={220}>
            <Group>
              <SettingRow
                icon="rectangle.portrait.and.arrow.right"
                tone="danger"
                label="Выйти"
                onPress={onSignOut}
              />
            </Group>
          </Reveal>
        ) : null}

        {/* Подвал-слоган + версия */}
        <Reveal delay={260}>
          <View style={styles.footer}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              See it. Catch it. Speak it.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerSub}>
              CatchWord · v{version}
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

      {/* Лист выбора голоса (нижний модал) */}
      <VoicePicker
        visible={voiceOpen}
        voices={voices}
        voicesLoading={voicesLoading}
        selected={selectedVoice}
        bottomInset={insets.bottom}
        onSelect={chooseVoice}
        onClose={() => setVoiceOpen(false)}
      />

      {/* Тост-подтверждение (смена языка и т.п.) */}
      <Toast message={toast} onHide={() => setToast(null)} />
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

// ---------------------------------------------------------------------------
// Нижний лист выбора голоса (свёрнутый список голосов → сюда)
// ---------------------------------------------------------------------------

interface VoicePickerProps {
  visible: boolean;
  voices: Speech.Voice[];
  voicesLoading: boolean;
  selected: string | null;
  bottomInset: number;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

function VoicePicker({ visible, voices, voicesLoading, selected, bottomInset, onSelect, onClose }: VoicePickerProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(180)}
          style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: bottomInset + Spacing.three }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <ThemedText type="default" style={styles.sheetTitle}>
            Голос озвучки
          </ThemedText>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetList}>
            <VoiceOption
              label="Системный голос"
              sublabel="По умолчанию"
              active={selected === null}
              onPress={() => onSelect(null)}
            />
            {voices.map((v) => (
              <VoiceOption
                key={v.identifier}
                label={v.name}
                sublabel={v.quality === Speech.VoiceQuality.Enhanced ? `${v.language} · Enhanced` : v.language}
                active={selected === v.identifier}
                onPress={() => onSelect(v.identifier)}
              />
            ))}
          </ScrollView>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sheetHint}>
            {voicesLoading
              ? 'Загружаю голоса…'
              : voices.length > 0
                ? 'Нажми голос, чтобы услышать пример.'
                : 'Другие голоса появятся на реальном устройстве.'}
          </ThemedText>
        </Animated.View>
      </View>
    </Modal>
  );
}

function VoiceOption({
  label,
  sublabel,
  active,
  onPress,
}: {
  label: string;
  sublabel?: string;
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
          <View style={styles.voiceOptionText}>
            <ThemedText type="default" numberOfLines={1} style={styles.rowLabel}>
              {label}
            </ThemedText>
            {sublabel ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {sublabel}
              </ThemedText>
            ) : null}
          </View>
          <VoiceTrailing selected={active} />
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
    overflow: 'hidden',
  },
  avatarImage: { width: 52, height: 52, borderRadius: Radius.lg },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  scansAccessory: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },

  // Секции и группы
  section: { gap: Spacing.two },
  sectionLabel: { marginLeft: Spacing.three, letterSpacing: 0.4, fontSize: 13 },
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
  voiceOptionText: { flex: 1, gap: 1 },
  sheetHint: { marginTop: Spacing.two, marginLeft: Spacing.one },
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
