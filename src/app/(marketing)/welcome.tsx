/**
 * Лендинг CatchWord (/welcome) — главная публичная страница (веб).
 * Hero · как это работает · возможности · тарифы (тизер) · финальный CTA.
 * Собрана из общих themed-компонентов (единый стиль с приложением).
 */
import { StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import Head from 'expo-router/head';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Container, GoogleButton, MarketingShell, useIsWide } from '@/components/marketing';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SFSymbol } from 'expo-symbols';
import { setGuest } from '@/lib/web-guest';

const STEPS: { icon: SFSymbol; title: string; text: string }[] = [
  { icon: 'camera.fill', title: 'Наведи', text: 'Покажи камере предмет или загрузи фото с устройства.' },
  { icon: 'sparkles', title: 'Поймай', text: 'AI распознаёт предмет и даёт слово, перевод и произношение.' },
  { icon: 'graduationcap.fill', title: 'Повторяй', text: 'Карточка попадает в коллекцию и вовремя возвращается на повтор.' },
];

const FEATURES: { icon: SFSymbol; title: string; text: string }[] = [
  { icon: 'camera.fill', title: 'Распознавание по фото', text: 'Камера видит предмет и сразу даёт слово, перевод и категорию.' },
  { icon: 'graduationcap.fill', title: 'Умное повторение', text: 'Интервальные повторения (SRS) — слова всплывают точно вовремя.' },
  { icon: 'speaker.wave.2.fill', title: 'Произношение', text: 'Озвучка слова — обычная и медленная скорость для тренировки.' },
  { icon: 'square.grid.2x2.fill', title: 'Коллекция по темам', text: 'Слова копятся стикерами — листай по датам или по темам.' },
  { icon: 'target', title: 'Квест дня', text: 'Маленькая ежедневная цель и серия дней подряд — не забросишь.' },
  { icon: 'lightbulb.fill', title: 'Примеры и мнемоника', text: 'AI добавляет примеры предложений и подсказки для запоминания.' },
];

export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useIsWide();

  const onGuest = () => {
    setGuest(true);
    router.replace('/');
  };

  return (
    <MarketingShell>
      <Head>
        <title>CatchWord — учи язык через камеру</title>
        <meta
          name="description"
          content="Наведи камеру на любой предмет — поймай слово, перевод, произношение и карточку для повторения. Учись там, где живёшь."
        />
        <meta property="og:title" content="CatchWord — учи язык через камеру" />
        <meta
          property="og:description"
          content="Наведи камеру на предмет — поймай слово и карточку для повторения."
        />
      </Head>

      {/* ───────── HERO ───────── */}
      <Container style={[styles.hero, wide && styles.heroWide]}>
        <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
          <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
            <Icon name="sparkles" size={14} color={theme.primary} />
            <ThemedText type="smallBold" themeColor="primary">
              AI учит словам по фото
            </ThemedText>
          </View>
          <ThemedText style={[styles.h1, wide && styles.h1Wide]}>Лови слова{'\n'}вокруг себя</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.lead}>
            Наведи камеру на любой предмет — получи слово на изучаемом языке, перевод,
            произношение и карточку для повторения. Учись там, где живёшь.
          </ThemedText>
          <View style={[styles.ctaRow, wide && styles.ctaRowWide]}>
            <GoogleButton />
            <Button title="Попробовать без аккаунта" variant="secondary" icon="arrow.right" onPress={onGuest} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Бесплатно · без установки · прямо в браузере
          </ThemedText>
        </View>

        <View style={styles.heroArtWrap}>
          <HeroArt />
        </View>
      </Container>

      {/* ───────── КАК ЭТО РАБОТАЕТ ───────── */}
      <Container style={styles.section}>
        <SectionTitle eyebrow="Как это работает" title="Три шага — и слово твоё" />
        <View style={[styles.steps, wide && styles.row3]}>
          {STEPS.map((s, i) => (
            <StepCard key={s.title} n={i + 1} icon={s.icon} title={s.title} text={s.text} />
          ))}
        </View>
      </Container>

      {/* ───────── ВОЗМОЖНОСТИ ───────── */}
      <Container style={styles.section}>
        <SectionTitle eyebrow="Возможности" title="Всё для живого изучения" />
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} text={f.text} wide={wide} />
          ))}
        </View>
      </Container>

      {/* ───────── ТАРИФЫ (ТИЗЕР) ───────── */}
      <Container style={styles.section}>
        <SectionTitle eyebrow="Тарифы" title="Начни бесплатно" />
        <View style={[styles.plans, wide && styles.row2]}>
          <PlanCard
            name="Free"
            price="0 ₸"
            note="навсегда"
            features={['15 сканов', 'Коллекция и повторение', 'Озвучка', 'Квест дня']}
          />
          <PlanCard
            name="Premium"
            price="990 ₸"
            note="в месяц"
            highlighted
            features={['Безлимит сканов', 'Все языки', '«Поймай всю сцену»', 'Синхронизация в облаке']}
          />
        </View>
        <View style={styles.pricingLink}>
          <Link href="/pricing" asChild>
            <Button title="Сравнить тарифы" variant="ghost" icon="chevron.right" />
          </Link>
        </View>
      </Container>

      {/* ───────── ФИНАЛЬНЫЙ CTA ───────── */}
      <Container style={styles.section}>
        <View style={[styles.ctaBand, { backgroundColor: theme.primary }]}>
          <ThemedText style={[styles.ctaTitle, { color: theme.onPrimary }]}>
            Готов поймать первое слово?
          </ThemedText>
          <ThemedText type="default" style={{ color: theme.onPrimary, opacity: 0.9, textAlign: 'center' }}>
            Войди и собери свою коллекцию слов из мира вокруг.
          </ThemedText>
          <View style={[styles.ctaRow, wide && styles.ctaRowWide]}>
            <GoogleButton />
            <Button title="Без аккаунта" variant="secondary" onPress={onGuest} />
          </View>
        </View>
      </Container>
    </MarketingShell>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="smallBold" themeColor="primary" style={styles.eyebrow}>
        {eyebrow.toUpperCase()}
      </ThemedText>
      <ThemedText style={styles.h2}>{title}</ThemedText>
    </View>
  );
}

/** Карточка-мок результата распознавания (продаёт продукт в hero). */
function HeroArt() {
  const theme = useTheme();
  return (
    <View style={styles.heroArt}>
      <View style={[styles.resultCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
        <Sticker category="Еда" size={132} />
        <View style={styles.resultWord}>
          <ThemedText style={styles.word}>apple</ThemedText>
          <View style={[styles.speak, { backgroundColor: theme.primarySoft }]}>
            <Icon name="speaker.wave.2.fill" size={16} color={theme.primary} />
          </View>
        </View>
        <ThemedText type="default" themeColor="textSecondary">[ˈæpl] · яблоко</ThemedText>
        <View style={[styles.caught, { backgroundColor: theme.accent }]}>
          <Icon name="sparkles" size={13} color={theme.onPrimary} />
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Поймал!
          </ThemedText>
        </View>
      </View>
      {/* плавающие мини-стикеры вокруг */}
      <View style={[styles.float, styles.floatTL]}>
        <Sticker category="Напитки" size={56} />
      </View>
      <View style={[styles.float, styles.floatBR]}>
        <Sticker category="Транспорт" size={56} />
      </View>
    </View>
  );
}

function StepCard({ n, icon, title, text }: { n: number; icon: SFSymbol; title: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.flex1, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.stepBadge, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={22} color={theme.primary} />
        <View style={[styles.stepNum, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            {n}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.cardTitle}>{title}</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

function FeatureCard({ icon, title, text, wide }: { icon: SFSymbol; title: string; text: string; wide: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.feature,
        wide ? styles.featureWide : styles.featureNarrow,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}>
      <View style={[styles.featureIcon, { backgroundColor: theme.accent2Soft }]}>
        <Icon name={icon} size={20} color={theme.accent2} />
      </View>
      <ThemedText style={styles.cardTitle}>{title}</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

function PlanCard({
  name,
  price,
  note,
  features,
  highlighted,
}: {
  name: string;
  price: string;
  note: string;
  features: string[];
  highlighted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.flex1,
        styles.plan,
        { backgroundColor: theme.card, borderColor: highlighted ? theme.primary : theme.border },
        highlighted && { borderWidth: 2 },
      ]}>
      {highlighted ? (
        <View style={[styles.planBadge, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Популярный
          </ThemedText>
        </View>
      ) : null}
      <ThemedText type="smallBold" themeColor="textSecondary">
        {name}
      </ThemedText>
      <View style={styles.priceRow}>
        <ThemedText style={styles.price}>{price}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {' '}
          {note}
        </ThemedText>
      </View>
      <View style={styles.planFeatures}>
        {features.map((f) => (
          <View key={f} style={styles.planFeature}>
            <Icon name="checkmark.circle.fill" size={18} color={theme.success} />
            <ThemedText type="default">{f}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // HERO
  hero: { paddingTop: Spacing.six, gap: Spacing.five },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: Spacing.six, paddingTop: 72 },
  heroCopy: { gap: Spacing.three, alignItems: 'flex-start' },
  heroCopyWide: { flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
  },
  h1: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -0.5 },
  h1Wide: { fontSize: 60, lineHeight: 64 },
  lead: { fontSize: 18, lineHeight: 28, maxWidth: 540 },
  ctaRow: { gap: Spacing.two, alignSelf: 'stretch' },
  ctaRowWide: { flexDirection: 'row', alignSelf: 'flex-start' },
  heroArtWrap: { alignItems: 'center', justifyContent: 'center' },

  heroArt: { width: 300, height: 320, alignItems: 'center', justifyContent: 'center' },
  resultCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 6,
  },
  resultWord: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  word: { fontSize: 30, fontWeight: '800' },
  speak: { width: 32, height: 32, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  caught: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
    marginTop: Spacing.two,
  },
  float: { position: 'absolute' },
  floatTL: { top: 8, left: 0 },
  floatBR: { bottom: 0, right: 4 },

  // sections
  section: { marginTop: Spacing.six, gap: Spacing.four },
  sectionTitle: { gap: Spacing.one, alignItems: 'center' },
  eyebrow: { letterSpacing: 1 },
  h2: { fontSize: 30, lineHeight: 36, fontWeight: '800', textAlign: 'center' },

  row2: { flexDirection: 'row', gap: Spacing.three },
  row3: { flexDirection: 'row', gap: Spacing.three },
  steps: { gap: Spacing.three },
  flex1: { flex: 1 },

  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  stepBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  stepNum: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // features (3 columns wide, 1 narrow — через minWidth/flexBasis)
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  feature: {},
  featureWide: { flexBasis: '31%', flexGrow: 1, minWidth: 260 },
  featureNarrow: { flexBasis: '100%' },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },

  // plans
  plans: { gap: Spacing.three },
  plan: { gap: Spacing.three },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontSize: 34, fontWeight: '800' },
  planFeatures: { gap: Spacing.two },
  planFeature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pricingLink: { alignItems: 'center' },

  // CTA band
  ctaBand: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
    borderRadius: Radius.xxl,
  },
  ctaTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
});
