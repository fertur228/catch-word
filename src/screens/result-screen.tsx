/**
 * Экран Результата (спека §5.3 — «сердце магии»).
 *
 * Сатисфайный reveal «Поймал!»: стикер с пружинным «попом», контент выезжает
 * лесенкой (react-native-reanimated). Показываем стикер + слово + транскрипцию +
 * 🔊 + перевод + категорию + ОДИН пример (тариф Free). Кнопки: ✓ Сохранить,
 * ↻ Переснять (новое случайное слово на месте), ✕ Отмена.
 *
 * Фича 2 — РЕДАКТИРУЕМОЕ слово: по тапу на слово (или карандашу) открывается
 * инлайн-редактор. По мере ввода показываем подсказки (suggestWords). Выбор
 * подсказки или совпадение по словарю (lookupWord) автозаполняет перевод + IPA
 * (+ категорию/эмодзи) и ставит бейдж «авто». Если слова нет в словаре —
 * честно говорим, что авто-перевод появится с бэкендом, и даём вписать вручную.
 *
 * Данные — мок (src/lib/mock-data.ts + src/lib/dictionary.ts), бэкенда и
 * реального распознавания нет. Экран показывается как модалка.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Confetti } from '@/components/anim/confetti';
import { FlyToTab } from '@/components/anim/fly-to-tab';
import { Shine } from '@/components/anim/sparkle';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { FadeIn, Reveal } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SpeakButton } from '@/components/speak-button';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedbackCorrect, feedbackImpact, feedbackWrong } from '@/lib/feedback';
import { useCollection } from '@/lib/collection-context';
import { lookupWord, suggestWords, type DictEntry } from '@/lib/dictionary';
import { RECOGNIZABLE, getRandomRecognizable } from '@/lib/mock-data';
import { getScanJob, type SceneItem } from '@/lib/scan-job';
import { speakWord } from '@/lib/speech';
import type { RecognizableWord, WordCard } from '@/types';

const STICKER_SIZE = 160;
/** Эмодзи-заглушка, когда у слова нет «узнаваемого» стикера (нет в RECOGNIZABLE). */
const FALLBACK_EMOJI = '';

/**
 * Текущее содержимое карточки на экране — то, что реально сохранится.
 * Изначально берётся из «распознанного» предмета, но пользователь может
 * отредактировать слово/перевод/IPA. `auto` — перевод подставлен из словаря.
 */
interface CardContent {
  word: string;
  translation: string;
  ipa: string;
  category?: string;
  emoji: string;
  auto: boolean;
  /** Реальный вырез/фото предмета (если есть). */
  imageUri?: string | null;
}

/** Содержимое из «распознанного» предмета (готовый перевод считаем «авто»). */
function fromRecognized(r: RecognizableWord): CardContent {
  return {
    word: r.word,
    translation: r.translation,
    ipa: r.ipa,
    category: r.category ?? undefined, // в типе допустим null — приводим к undefined
    emoji: r.emoji,
    auto: true,
    imageUri: r.imageUri ?? null,
  };
}

/**
 * Распознанный предмет из текущего скана: реальный результат, если он есть
 * (Фаза 1), иначе мок-слово — но с РЕАЛЬНЫМ фото/вырезом, если кадр сняли
 * (Фаза 0). Так экран Результата осмыслен на любой стадии.
 */
function seedRecognized(
  job: ReturnType<typeof getScanJob>,
  prefs: { learningLang: string; nativeLang: string },
): RecognizableWord {
  const imageUri = job?.cutoutUri ?? job?.photoUri ?? null;
  if (job?.result) {
    const r = job.result;
    return {
      emoji: r.emoji,
      imageUri,
      word: r.word,
      translation: r.translation,
      ipa: r.ipa,
      examples: r.examples ?? [],
      category: r.category ?? null,
      notes: r.note || undefined,
      distractors: r.distractors ?? [],
      synonyms: r.synonyms ?? [],
      learningLang: prefs.learningLang,
      nativeLang: prefs.nativeLang,
    };
  }
  const mock = getRandomRecognizable();
  return { ...mock, imageUri: imageUri ?? mock.imageUri ?? null };
}

/** Эмодзи по слову: берём из RECOGNIZABLE при точном совпадении, иначе заглушка. */
function emojiForWord(word: string): string {
  const q = word.trim().toLowerCase();
  const hit = RECOGNIZABLE.find((r) => r.word.toLowerCase() === q);
  return hit ? hit.emoji : FALLBACK_EMOJI;
}

export function ResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { addCard, prefs, completeQuestForWord, cards } = useCollection();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();

  // Текущий скан (фото + результат распознавания + вырез). Читаем синхронно:
  // к моменту перехода на Результат экран «Распознаю…» уже всё положил.
  const job = getScanJob(jobId);
  // «Распознанный» предмет: реальный результат или мок (с реальным фото, если есть).
  const [recognized] = useState<RecognizableWord>(() => seedRecognized(job, prefs));
  // Текущее (возможно отредактированное) содержимое карточки.
  const [content, setContent] = useState<CardContent>(() => fromRecognized(recognized));
  // Маленький «успех» после сохранения (зелёная печать на стикере) перед закрытием.
  const [saved, setSaved] = useState(false);
  // Сообщение о квесте после сохранения: «Квест дня: 1 из 3» или «выполнен!».
  const [questMsg, setQuestMsg] = useState<string | null>(null);
  // Слово уже было в коллекции — не плодим дубликат.
  const [alreadyHave, setAlreadyHave] = useState(false);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Конфетти при поимке/сохранении и «полёт» стикера в коллекцию.
  const [burst, setBurst] = useState(0);
  const [flyTs, setFlyTs] = useState(0);

  // --- Состояние инлайн-редактора слова (фича 2) ---
  const [editing, setEditing] = useState(false);
  const [draftWord, setDraftWord] = useState('');
  const [draftTranslation, setDraftTranslation] = useState('');
  const [draftIpa, setDraftIpa] = useState('');
  const [draftCategory, setDraftCategory] = useState<string | undefined>(undefined);
  const [draftEmoji, setDraftEmoji] = useState('');
  // Перевод/IPA подставлены автоматически из словаря (не правились руками).
  const [draftAuto, setDraftAuto] = useState(false);
  // Пользователь правил перевод/IPA вручную — тогда не затираем их при наборе слова.
  const [draftTransEdited, setDraftTransEdited] = useState(false);
  // Показывать ли выпадашку подсказок (прячем после выбора).
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Подсказки по мере ввода (substring-автодополнение из словаря).
  const suggestions = draftWord.trim() ? suggestWords(draftWord, 6) : [];

  // Момент «Поймал!»: конфетти-салют + тактильный удар (кроме режима сцены —
  // там свой поток мульти-выбора без единого героя).
  useEffect(() => {
    if (job?.mode === 'scene' && job.items && job.items.length > 1) return;
    const t = setTimeout(() => {
      setBurst(1);
      feedbackImpact();
    }, 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Озвучиваем слово сразу после «попа» стикера — «See it. Catch it. Speak it.».
  useEffect(() => {
    const t = setTimeout(() => speakWord(recognized.word, recognized.learningLang), 420);
    return () => clearTimeout(t);
  }, [recognized.word, recognized.learningLang]);

  // Чистим таймер закрытия при размонтировании.
  useEffect(() => () => {
    if (backTimer.current) clearTimeout(backTimer.current);
  }, []);

  const onSave = useCallback(async () => {
    if (saved) return; // защита от двойного нажатия
    // Дубликат: слово уже в коллекции — копию не создаём, но квест засчитываем.
    const dup = cards.find(
      (c) =>
        c.word.trim().toLowerCase() === content.word.trim().toLowerCase() &&
        c.learningLang === recognized.learningLang,
    );
    if (dup) {
      setAlreadyHave(true);
      setSaved(true);
      feedbackWrong(); // мягкий «бзз» — уже поймано
      const q = await completeQuestForWord(content.word);
      if (q.caught) setQuestMsg(q.completed ? 'Квест дня выполнен!' : `Квест дня: ${q.progress} из ${q.total}`);
      backTimer.current = setTimeout(() => router.back(), q.caught ? 1900 : 1100);
      return;
    }
    const sameWord = content.word === recognized.word;
    const card: WordCard = {
      ...recognized,
      // Перекрываем поля возможной правкой пользователя.
      word: content.word,
      translation: content.translation,
      ipa: content.ipa,
      category: content.category ?? null,
      emoji: content.emoji,
      imageUri: content.imageUri ?? null,
      // Примеры/заметка/варианты подходят только исходному слову — для изменённого их нет.
      examples: sameWord ? recognized.examples : [],
      notes: sameWord ? recognized.notes : undefined,
      distractors: sameWord ? recognized.distractors : undefined,
      synonyms: sameWord ? recognized.synonyms : undefined,
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      createdAt: Date.now(),
    };
    await addCard(card);
    setSaved(true);
    feedbackCorrect(); // радостный «дзынь» + успех-вибрация
    setBurst((b) => b + 1); // ещё один салют на сохранение
    setFlyTs(Date.now()); // стикер «улетает» в коллекцию
    // Квест дня: если поймали целевой предмет — засчитываем и показываем дольше.
    const q = await completeQuestForWord(card.word);
    if (q.caught) setQuestMsg(q.completed ? 'Квест дня выполнен!' : `Квест дня: ${q.progress} из ${q.total}`);
    // Даём увидеть «печать» успеха (и квест), затем закрываем модалку.
    backTimer.current = setTimeout(() => router.back(), q.caught ? 1900 : 760);
  }, [saved, content, recognized, addCard, router, completeQuestForWord, cards]);

  // «Переснять» — закрываем результат и возвращаемся к камере снять новый кадр.
  const onRetake = useCallback(() => {
    router.back();
  }, [router]);

  const onCancel = useCallback(() => router.back(), [router]);

  // --- Редактор: открыть/применить подсказку/менять поля/подтвердить/отменить ---

  // Открыть редактор: переносим текущее содержимое в черновик.
  const openEdit = useCallback(() => {
    setDraftWord(content.word);
    setDraftTranslation(content.translation);
    setDraftIpa(content.ipa);
    setDraftCategory(content.category);
    setDraftEmoji(content.emoji);
    setDraftAuto(content.auto);
    setDraftTransEdited(false);
    setShowSuggestions(false);
    setEditing(true);
  }, [content]);

  // Применить запись словаря (тап по подсказке) — автозаполнение всех полей.
  const applyDictEntry = useCallback((entry: DictEntry) => {
    setDraftWord(entry.word);
    setDraftTranslation(entry.translation);
    setDraftIpa(entry.ipa);
    setDraftCategory(entry.category);
    setDraftEmoji(emojiForWord(entry.word));
    setDraftAuto(true);
    setDraftTransEdited(false);
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, []);

  // Ввод слова: если есть точное совпадение в словаре — автозаполняем.
  // Иначе бейдж «авто» гаснет; нетронутые руками перевод/IPA очищаем.
  function onChangeWord(text: string) {
    setDraftWord(text);
    setShowSuggestions(true);
    const hit = lookupWord(text);
    if (hit) {
      setDraftTranslation(hit.translation);
      setDraftIpa(hit.ipa);
      setDraftCategory(hit.category);
      setDraftEmoji(emojiForWord(hit.word));
      setDraftAuto(true);
      setDraftTransEdited(false);
    } else {
      setDraftAuto(false);
      if (!draftTransEdited) {
        setDraftTranslation('');
        setDraftIpa('');
        setDraftCategory(undefined);
        setDraftEmoji(FALLBACK_EMOJI);
      }
    }
  }

  // Ручная правка перевода/IPA — это уже не «авто».
  function onChangeTranslation(text: string) {
    setDraftTranslation(text);
    setDraftTransEdited(true);
    setDraftAuto(false);
  }
  function onChangeIpa(text: string) {
    setDraftIpa(text);
    setDraftTransEdited(true);
    setDraftAuto(false);
  }

  // Подтвердить правку — переносим черновик в содержимое карточки.
  const confirmEdit = useCallback(() => {
    const word = draftWord.trim() || content.word; // пустое слово не сохраняем
    setContent((prev) => ({
      word,
      translation: draftTranslation.trim(),
      ipa: draftIpa.trim(),
      category: draftCategory,
      emoji: draftEmoji || FALLBACK_EMOJI,
      auto: draftAuto,
      imageUri: prev.imageUri ?? null,
    }));
    setEditing(false);
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, [draftWord, draftTranslation, draftIpa, draftCategory, draftEmoji, draftAuto, content.word]);

  // Отменить правку — просто закрываем редактор, черновик отбрасываем.
  const cancelEdit = useCallback(() => {
    setEditing(false);
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, []);

  // Примеры/заметку показываем только для исходного слова (своё слово — без них).
  const sameWord = content.word === recognized.word;
  const examples = sameWord ? recognized.examples.slice(0, 3) : [];
  const note = sameWord ? recognized.notes : undefined;
  const synonyms = sameWord ? (recognized.synonyms ?? []).slice(0, 3) : [];
  // Честная подсказка в редакторе: слово введено, но автоперевода нет.
  const showBackendHint = !draftAuto && draftWord.trim().length > 0;

  // Режим «поймай всю сцену»: несколько предметов → мульти-выбор (отдельный поток).
  if (job?.mode === 'scene' && job.items && job.items.length > 1) {
    return <SceneCatch items={job.items} prefs={prefs} />;
  }

  return (
    <>
    <Screen scroll>
      {/* Группа появления. */}
      <View style={styles.reveal}>
        {questMsg ? (
          <Animated.View
            entering={ZoomIn.springify().damping(13).stiffness(180)}
            style={[styles.questDone, { backgroundColor: theme.accentSoft }]}>
            <Icon name="sparkles" size={15} color={theme.accent} />
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {questMsg}
            </ThemedText>
          </Animated.View>
        ) : null}
        {alreadyHave ? (
          <Animated.View
            entering={ZoomIn.springify().damping(13).stiffness(180)}
            style={[styles.questDone, { backgroundColor: theme.accent2Soft }]}>
            <Icon name="checkmark.circle.fill" size={15} color={theme.accent2} />
            <ThemedText type="smallBold" style={{ color: theme.accent2 }}>
              Уже в коллекции
            </ThemedText>
          </Animated.View>
        ) : null}
        {/* Бейдж «Поймал!» — тёплый акцент, «выскакивает» с ощущением победы. */}
        <Reveal preset="zoom" style={styles.caughtRow}>
          <View style={[styles.caughtBadge, { backgroundColor: theme.accentSoft }]}>
            <Icon name="sparkles" size={15} color={theme.accent} />
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Поймал!
            </ThemedText>
          </View>
        </Reveal>

        {/* Стикер с пружинным «попом» + печать успеха после сохранения. */}
        <StickerPop category={content.category} imageUri={content.imageUri} saved={saved} shake={alreadyHave} />

        {editing ? (
          /* --- Инлайн-редактор слова (фича 2) --- */
          <Reveal delay={60}>
            <View
              style={[
                styles.editPanel,
                { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow },
              ]}>
              <View style={styles.editHeader}>
                <Icon name="pencil" size={15} color={theme.primary} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Измени слово
                </ThemedText>
              </View>

              {/* Поле слова + автодополнение. */}
              <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  value={draftWord}
                  onChangeText={onChangeWord}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Слово на английском"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={confirmEdit}
                  style={[styles.fieldInput, styles.wordInput, { color: theme.text }]}
                />
                {draftWord.length > 0 ? (
                  <Pressable onPress={() => onChangeWord('')} hitSlop={8} accessibilityLabel="Очистить">
                    <Icon name="xmark.circle.fill" size={18} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Выпадашка подсказок: слово + перевод. */}
              {showSuggestions && suggestions.length > 0 ? (
                <Animated.View
                  entering={FadeInDown.duration(Motion.duration.fast)}
                  style={[styles.suggestBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  {suggestions.map((s, i) => (
                    <Pressable
                      key={s.word}
                      onPress={() => applyDictEntry(s)}
                      style={({ pressed }) => [
                        styles.suggestRow,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                        pressed && { backgroundColor: theme.backgroundElement },
                      ]}>
                      <ThemedText type="default" style={styles.suggestWord}>
                        {s.word}
                      </ThemedText>
                      <ThemedText themeColor="textSecondary" style={styles.suggestTranslation} numberOfLines={1}>
                        {s.translation}
                      </ThemedText>
                    </Pressable>
                  ))}
                </Animated.View>
              ) : null}

              {/* Перевод (+ бейдж «авто», если из словаря). */}
              <View style={styles.fieldLabelRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Перевод
                </ThemedText>
                {draftAuto ? <AutoBadge /> : null}
              </View>
              <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  value={draftTranslation}
                  onChangeText={onChangeTranslation}
                  placeholder="Перевод на русский"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.fieldInput, { color: theme.text }]}
                />
              </View>

              {/* Транскрипция. */}
              <View style={styles.fieldLabelRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Транскрипция
                </ThemedText>
              </View>
              <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  value={draftIpa}
                  onChangeText={onChangeIpa}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="напр. ˈlem.ən"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.fieldInput, { color: theme.text }]}
                />
              </View>

              {/* Честная подсказка: автоперевода для своего слова пока нет. */}
              {showBackendHint ? (
                <FadeIn>
                  <View style={[styles.hint, { backgroundColor: theme.warningSoft }]}>
                    <Icon name="info.circle.fill" size={15} color={theme.warning} />
                    <ThemedText type="small" style={[styles.hintText, { color: theme.warning }]}>
                      Авто-перевод появится с бэкендом — впиши сам или выбери из подсказок
                    </ThemedText>
                  </View>
                </FadeIn>
              ) : null}

              {/* Кнопки редактора. */}
              <View style={styles.editActions}>
                <Button title="Готово" icon="checkmark" onPress={confirmEdit} style={styles.flex} />
                <Button title="Отмена" icon="xmark" variant="ghost" onPress={cancelEdit} style={styles.flex} />
              </View>
            </View>
          </Reveal>
        ) : (
          <>
            {/* Слово + транскрипция + 🔊 + перевод — одним блоком, плотной лесенкой. */}
            <Reveal delay={160}>
              <View style={styles.wordBlock}>
                {/* Слово кликабельно + карандаш — приглашение отредактировать. */}
                <Pressable
                  onPress={openEdit}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Изменить слово"
                  style={({ pressed }) => [styles.wordRow, { opacity: pressed ? 0.6 : 1 }]}>
                  <ThemedText type="default" style={styles.word}>
                    {content.word}
                  </ThemedText>
                  <View style={[styles.pencil, { backgroundColor: theme.backgroundElement }]}>
                    <Icon name="pencil" size={15} color={theme.textSecondary} />
                  </View>
                </Pressable>

                {content.ipa ? (
                  <View style={styles.ipaRow}>
                    <ThemedText themeColor="textSecondary" style={styles.ipa}>
                      /{content.ipa}/
                    </ThemedText>
                    <SpeakButton text={content.word} language={recognized.learningLang} size={44} />
                    <SpeakButton text={content.word} language={recognized.learningLang} size={44} slow />
                  </View>
                ) : (
                  <View style={styles.ipaRow}>
                    <SpeakButton text={content.word} language={recognized.learningLang} size={44} />
                    <SpeakButton text={content.word} language={recognized.learningLang} size={44} slow />
                  </View>
                )}

                <View style={styles.translationRow}>
                  <ThemedText themeColor="textSecondary" style={styles.translation}>
                    {content.translation || '—'}
                  </ThemedText>
                  {content.auto && content.translation ? <AutoBadge /> : null}
                </View>
              </View>
            </Reveal>

            {/* Категория предмета. */}
            {content.category ? (
              <Reveal delay={240}>
                <View style={styles.centerRow}>
                  <Chip label={content.category} icon="tag.fill" selected />
                </View>
              </Reveal>
            ) : null}

            {/* Примеры употребления (AI, 2–3 предложения с этим словом). */}
            {examples.length > 0 ? (
              <Reveal delay={300}>
                <View
                  style={[styles.exampleCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.exampleHeader}>
                    <Icon name="text.bubble.fill" size={15} color={theme.accent2} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {examples.length > 1 ? 'Примеры' : 'Пример'}
                    </ThemedText>
                  </View>
                  {examples.map((ex, i) => (
                    <ThemedText key={i} style={styles.exampleText}>
                      {ex}
                    </ThemedText>
                  ))}
                </View>
              </Reveal>
            ) : null}

            {/* Синонимы (AI, до 3) — «ещё так говорят». */}
            {synonyms.length > 0 ? (
              <Reveal delay={320}>
                <View
                  style={[styles.exampleCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.exampleHeader}>
                    <Icon name="arrow.left.arrow.right" size={15} color={theme.accent2} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      Синонимы
                    </ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one }}>
                    {synonyms.map((s, i) => (
                      <View
                        key={i}
                        style={{
                          paddingHorizontal: Spacing.three,
                          paddingVertical: Spacing.one,
                          borderRadius: Radius.pill,
                          backgroundColor: theme.backgroundElement,
                        }}>
                        <ThemedText type="small">{s}</ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              </Reveal>
            ) : null}

            {/* Заметка-мнемоника (AI) — «как запомнить». */}
            {note ? (
              <Reveal delay={340}>
                <View
                  style={[styles.exampleCard, { backgroundColor: theme.goldSoft, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.exampleHeader}>
                    <Icon name="lightbulb.fill" size={15} color={theme.gold} />
                    <ThemedText type="smallBold" style={{ color: theme.gold }}>
                      Запомни
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.exampleText}>{note}</ThemedText>
                </View>
              </Reveal>
            ) : null}
          </>
        )}
      </View>

      {/* Действия (прячем во время правки — у редактора свои «Готово/Отмена»). */}
      {!editing ? (
        <Reveal delay={360} style={styles.actions}>
          <Button title={saved ? 'Сохранено!' : 'Сохранить'} icon="checkmark" onPress={onSave} />
          <View style={styles.actionRow}>
            <Button
              title="Переснять"
              icon="arrow.counterclockwise"
              variant="secondary"
              onPress={onRetake}
              disabled={saved}
              style={styles.flex}
            />
            <Button title="Отмена" icon="xmark" variant="ghost" onPress={onCancel} disabled={saved} style={styles.flex} />
          </View>
        </Reveal>
      ) : null}
    </Screen>

    {/* Салют при поимке/сохранении + «полёт» стикера в коллекцию (поверх всего). */}
    <Confetti trigger={burst} originTop="30%" count={24} />
    <FlyToTab trigger={flyTs} category={content.category} imageUri={content.imageUri} startTop={0.28} />
    </>
  );
}

/**
 * Бейдж «авто» — мягкая бирюзовая таблетка с искрой. Показываем рядом с
 * переводом, когда он подставлен автоматически из словаря.
 */
function AutoBadge() {
  const theme = useTheme();
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(14).stiffness(200)}
      style={[styles.autoBadge, { backgroundColor: theme.accent2Soft }]}>
      <Icon name="sparkles" size={11} color={theme.accent2} />
      <ThemedText type="smallBold" style={[styles.autoBadgeText, { color: theme.accent2 }]}>
        авто
      </ThemedText>
    </Animated.View>
  );
}

/**
 * Стикер с пружинным появлением («поп» + лёгкий доворот) и зелёной «печатью»
 * успеха, всплывающей после сохранения. Ремоунтится вместе с группой появления,
 * поэтому при «Переснять» «поп» проигрывается заново.
 */
function StickerPop({
  category,
  imageUri,
  saved,
  shake,
}: {
  category?: string | null;
  imageUri?: string | null;
  saved: boolean;
  /** Горизонтальная «тряска» — сигнал, что слово уже в коллекции. */
  shake?: boolean;
}) {
  const theme = useTheme();
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(-6);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: Motion.duration.fast });
    scale.value = withDelay(70, withSpring(1, Motion.spring.bouncy));
    rotate.value = withDelay(70, withSpring(0, Motion.spring.bouncy));
  }, [opacity, scale, rotate]);

  // Тряска при обнаружении дубликата.
  useEffect(() => {
    if (!shake) return;
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  }, [shake, shakeX]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: shakeX.value }, { scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  const radius = STICKER_SIZE * 0.28;

  return (
    <View style={styles.stickerWrap}>
      <Animated.View style={animStyle}>
        <Sticker category={category} imageUri={imageUri} size={STICKER_SIZE} />
        {/* Разовый световой блик по стикеру (скруглённый оверлей — тень не режем). */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
          <Shine trigger={saved ? 2 : 1} width={STICKER_SIZE} />
        </View>
      </Animated.View>

      {saved ? (
        <Animated.View
          entering={ZoomIn.springify().damping(12).stiffness(180)}
          style={[
            styles.savedBadge,
            { backgroundColor: theme.success, borderColor: theme.background, shadowColor: theme.shadow },
          ]}>
          <Icon name="checkmark" size={26} color="#FFFFFF" />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Склонение «предмет» по числу (1 предмет / 2 предмета / 5 предметов). */
function pluralObjects(n: number): string {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return 'предметов';
  if (b === 1) return 'предмет';
  if (b > 1 && b < 5) return 'предмета';
  return 'предметов';
}

/**
 * «Поймай всю сцену»: список распознанных предметов с выбором — добавить все
 * отмеченные в коллекцию одним нажатием. Быстрый поток без инлайн-редактора.
 */
function SceneCatch({
  items,
  prefs,
}: {
  items: SceneItem[];
  prefs: { learningLang: string; nativeLang: string };
}) {
  const router = useRouter();
  const theme = useTheme();
  const { addCard, cards } = useCollection();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(items.map((_, i) => i)));
  const [saving, setSaving] = useState(false);

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    // Не плодим дубликаты уже пойманных слов (по слову + языку изучения).
    const have = new Set(cards.map((c) => `${c.word.trim().toLowerCase()}|${c.learningLang}`));
    for (let i = 0; i < items.length; i += 1) {
      if (!selected.has(i)) continue;
      const r = items[i].result;
      const key = `${r.word.trim().toLowerCase()}|${prefs.learningLang}`;
      if (have.has(key)) continue;
      have.add(key);
      const card: WordCard = {
        id: `${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`,
        word: r.word,
        translation: r.translation,
        ipa: r.ipa,
        category: r.category ?? null,
        emoji: r.emoji,
        imageUri: items[i].cutoutUri ?? null,
        examples: r.examples ?? [],
        notes: r.note,
        distractors: r.distractors,
        synonyms: r.synonyms,
        learningLang: prefs.learningLang,
        nativeLang: prefs.nativeLang,
        createdAt: Date.now() + i,
      };
      await addCard(card);
    }
    router.back();
  }, [saving, cards, items, selected, prefs, addCard, router]);

  return (
    <Screen scroll>
      <Reveal delay={0}>
        <View style={styles.sceneHeader}>
          <Icon name="square.grid.2x2.fill" size={22} color={theme.primary} />
          <ThemedText type="subtitle" style={styles.textCenter}>
            Поймал {items.length} {pluralObjects(items.length)}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.textCenter}>
            Выбери, что добавить в коллекцию.
          </ThemedText>
        </View>
      </Reveal>

      <View style={styles.sceneList}>
        {items.map((it, i) => {
          const on = selected.has(i);
          const r = it.result;
          return (
            <Reveal key={i} delay={60 + Math.min(i, 8) * 40}>
              <Pressable
                onPress={() => toggle(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.sceneRow,
                  {
                    backgroundColor: theme.card,
                    borderColor: on ? theme.primary : theme.border,
                    borderWidth: on ? 2 : 1,
                  },
                ]}>
                <Sticker category={r.category} imageUri={it.cutoutUri} size={56} />
                <View style={styles.sceneRowText}>
                  <ThemedText type="default" style={styles.sceneWord} numberOfLines={1}>
                    {r.word}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {r.translation}
                  </ThemedText>
                </View>
                <Icon
                  name={on ? 'checkmark.circle.fill' : 'circle'}
                  size={24}
                  color={on ? theme.primary : theme.border}
                />
              </Pressable>
            </Reveal>
          );
        })}
      </View>

      <Reveal delay={140} style={styles.actions}>
        <Button
          title={`Добавить (${selected.size})`}
          icon="checkmark"
          onPress={onSave}
          loading={saving}
          disabled={selected.size === 0}
        />
        <Button title="Отмена" icon="xmark" variant="ghost" onPress={() => router.back()} disabled={saving} />
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reveal: { gap: Spacing.three },
  questDone: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
  },
  caughtRow: { alignItems: 'center' },
  caughtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
  },
  stickerWrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  savedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  wordBlock: { alignItems: 'center', gap: Spacing.two },
  wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  word: { fontSize: 42, lineHeight: 46, fontWeight: '700', textAlign: 'center' },
  pencil: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ipaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  ipa: { fontSize: 16 },
  translationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  translation: { fontSize: 22, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  centerRow: { alignItems: 'center' },
  // --- Бейдж «авто» ---
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  autoBadgeText: { fontSize: 12, lineHeight: 14 },
  // --- Редактор слова ---
  editPanel: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.half },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 50,
    borderRadius: Radius.md,
  },
  fieldInput: { flex: 1, fontSize: 17, paddingVertical: 13, padding: 0 },
  wordInput: { fontSize: 20, fontWeight: '700' },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  suggestBox: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  suggestWord: { fontSize: 16, fontWeight: '600' },
  suggestTranslation: { fontSize: 14, flexShrink: 1, textAlign: 'right' },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    marginTop: Spacing.one,
  },
  hintText: { flex: 1, lineHeight: 20 },
  editActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  exampleCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  exampleHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  exampleText: { fontSize: 17, lineHeight: 24 },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  actionRow: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  // --- «Поймай всю сцену» ---
  textCenter: { textAlign: 'center' },
  sceneHeader: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  sceneList: { gap: Spacing.two },
  sceneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.lg,
  },
  sceneRowText: { flex: 1, gap: 1 },
  sceneWord: { fontWeight: '700' },
});
