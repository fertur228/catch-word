/**
 * Лендинг CatchWord (/welcome) — маркетинговая страница по структуре YC:
 * герой → доверие → как это работает → возможности → почему работает →
 * тарифы → FAQ → финальный CTA. Тёплая «Claude»-эстетика: серифные заголовки,
 * коралловый акцент, много воздуха. Веб-first, но на общих themed-компонентах
 * (работает и на нативе). Тёмная/светлая тема — через токены useTheme().
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { Container, MarketingShell, useIsWide } from '@/components/marketing';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { setGuest } from '@/lib/web-guest';

const FEATURES: { icon: SFSymbol; title: string; desc: string }[] = [
  { icon: 'sparkles', title: 'Умное распознавание', desc: 'Не просто перевод: примеры, мнемоника и подсказки в одном касании.' },
  { icon: 'square.grid.2x2', title: 'Поймай всю сцену', desc: 'До 8 предметов за один кадр — целая комната новых слов сразу.' },
  { icon: 'arrow.triangle.2.circlepath', title: 'Интервальные повторения', desc: 'Выверенный график повторов — слова остаются с тобой надолго.' },
  { icon: 'rectangle.stack.fill', title: 'Коллекция-стикеры', desc: 'Каждое слово — вырезанный стикер предмета. Твой визуальный словарь.' },
  { icon: 'speaker.wave.2.fill', title: 'Произношение', desc: 'Слушай, как звучит слово, и повторяй вслух с первого раза.' },
  { icon: 'globe', title: 'Все языки', desc: 'Учи любую пару языков в Premium. Один аккаунт — все устройства.' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'CatchWord бесплатный?', a: 'Да. 10 сканов бесплатно навсегда, без карты. Premium снимает лимит и открывает все языки.' },
  { q: 'Нужен интернет?', a: 'Для распознавания — да. Коллекция, карточки и повторение работают и офлайн.' },
  { q: 'На чём работает?', a: 'Прямо в браузере и как приложение — прогресс синхронизируется между устройствами.' },
  { q: 'Какие языки?', a: 'Английский и другие; в Premium доступны все пары языков.' },
  { q: 'Как отменить Premium?', a: 'В любой момент, без скрытых списаний.' },
];

export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useIsWide();
  const { signInWithGoogle } = useAuth();

  const onStart = () => void signInWithGoogle().catch(() => {});
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
          content="Наведи камеру на любой предмет — получи слово, перевод, произношение и карточку для запоминания. Учи язык в реальной жизни. 10 сканов бесплатно."
        />
      </Head>

      {/* ── HERO ── */}
      <Container style={[styles.hero, wide && styles.heroWide]}>
        <View style={[styles.heroText, wide && styles.heroTextWide]}>
          <Eyebrow icon="sparkles" label="AI-словарь в камере" />
          <ThemedText style={[styles.h1, wide && styles.h1Wide]}>Мир вокруг — твой словарь.</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.heroSub}>
            Наведи камеру CatchWord на любой предмет — получи слово на новом языке, перевод,
            произношение и карточку, которая сама вернётся на повтор.
          </ThemedText>
          <View style={styles.heroCtas}>
            <Cta label="Начать бесплатно" onPress={onStart} />
            <Pressable onPress={onGuest} hitSlop={8} style={styles.ghostLink}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Осмотреться без входа →
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.heroNote}>
            Бесплатно навсегда · 10 сканов · без карты
          </ThemedText>
        </View>

        <View style={[styles.heroVisual, wide && styles.heroVisualWide]}>
          <WordCard />
        </View>
      </Container>

      {/* ── TRUST STRIP ── */}
      <Container>
        <View style={[styles.trust, { borderColor: theme.border }]}>
          <Trust icon="gift.fill" text="10 сканов бесплатно" />
          <Trust icon="sparkles" text="Примеры и мнемоники от AI" />
          <Trust icon="arrow.triangle.2.circlepath" text="Повтор по системе SRS" />
        </View>
      </Container>

      {/* ── HOW IT WORKS ── */}
      <Container style={styles.section}>
        <Header eyebrow="Как это работает" title="Три шага до первого слова" />
        <View style={[styles.grid, wide && styles.row]}>
          <Step wide={wide} n="1" icon="camera.fill" title="Наведи камеру" desc="Открой CatchWord и наведи на любой предмет — дома, на улице, в кафе." />
          <Step wide={wide} n="2" icon="sparkles" title="Поймай слово" desc="AI распознаёт предмет и выдаёт слово, перевод, транскрипцию и живые примеры." />
          <Step wide={wide} n="3" icon="arrow.triangle.2.circlepath" title="Запоминай" desc="Слово попадает в коллекцию и возвращается на повтор, когда ты вот-вот его забудешь." />
        </View>
      </Container>

      {/* ── FEATURES ── */}
      <Container style={styles.section}>
        <Header eyebrow="Что внутри" title="Больше, чем переводчик" />
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <Feature key={f.title} wide={wide} {...f} />
          ))}
        </View>
      </Container>

      {/* ── METHOD ── */}
      <Container style={styles.section}>
        <View style={[styles.method, { backgroundColor: theme.accentSoft }]}>
          <Header eyebrow="Почему это работает" title="Слова, которые остаются" center />
          <View style={[styles.grid, wide && styles.row, styles.methodRows]}>
            <MethodPoint wide={wide} icon="lightbulb.fill" title="Контекст важнее списков" desc="Ты запоминаешь слово вместе с реальным предметом и моментом — мозг цепляется крепче, чем за строчку в списке." />
            <MethodPoint wide={wide} icon="clock.fill" title="Повтор в нужный момент" desc="Карточка возвращается ровно тогда, когда ты вот-вот забудешь — это и есть интервальное повторение." />
          </View>
        </View>
      </Container>

      {/* ── PRICING TEASER ── */}
      <Container style={styles.section}>
        <Header eyebrow="Тарифы" title="Начни бесплатно" />
        <View style={[styles.grid, wide && styles.row]}>
          <MiniPlan wide={wide} name="Free" price="$0" note="навсегда" items={['10 сканов', 'Коллекция и повторение', 'Один язык']} />
          <MiniPlan wide={wide} name="Premium" price="$6.99" note="в месяц" highlighted items={['Безлимит сканов', 'Все языки', 'Поймай всю сцену', '7 дней бесплатно']} />
        </View>
        <Pressable onPress={() => router.push('/pricing')} hitSlop={8} style={styles.centerLink}>
          <ThemedText type="smallBold" themeColor="accent">
            Сравнить тарифы →
          </ThemedText>
        </Pressable>
      </Container>

      {/* ── FAQ ── */}
      <Container style={styles.section}>
        <Header eyebrow="Вопросы" title="Коротко о главном" />
        <View style={styles.faq}>
          {FAQ.map((item) => (
            <Faq key={item.q} {...item} />
          ))}
        </View>
      </Container>

      {/* ── FINAL CTA ── */}
      <Container style={styles.section}>
        <View style={[styles.finalCta, { backgroundColor: theme.accentSoft }]}>
          <ThemedText style={styles.finalTitle}>Начни ловить слова сегодня</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.finalSub}>
            Открой камеру — и первое слово уже твоё.
          </ThemedText>
          <Cta label="Начать бесплатно" onPress={onStart} />
        </View>
      </Container>
    </MarketingShell>
  );
}

// ── Мелкие компоненты страницы ────────────────────────────────────────────────

function Eyebrow({ icon, label }: { icon: SFSymbol; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.eyebrow, { backgroundColor: theme.accentSoft }]}>
      <Icon name={icon} size={15} color={theme.accent} />
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Тёплый коралловый CTA (вход через Google). */
function Cta({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cta, { backgroundColor: theme.accent, shadowColor: theme.accent, opacity: pressed ? 0.92 : 1 }]}>
      <Icon name="person.crop.circle.badge.plus" size={19} color="#FFFFFF" />
      <ThemedText style={styles.ctaLabel}>{label}</ThemedText>
    </Pressable>
  );
}

/** Визуал героя — «пойманное слово» карточкой. */
function WordCard() {
  const theme = useTheme();
  return (
    <View style={[styles.wordCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <View style={[styles.caughtBadge, { backgroundColor: theme.accentSoft }]}>
        <Icon name="checkmark.seal.fill" size={14} color={theme.accent} />
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          поймано
        </ThemedText>
      </View>
      <Sticker symbol="cup.and.saucer.fill" tone="accent" size={84} />
      <ThemedText style={[styles.wordWord, { color: theme.text }]}>coffee</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        кофе · /ˈkɒf.i/
      </ThemedText>
      <View style={[styles.wordExample, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          «Two coffees, please.»
        </ThemedText>
      </View>
    </View>
  );
}

function Trust({ icon, text }: { icon: SFSymbol; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.trustItem}>
      <Icon name={icon} size={18} color={theme.accent} />
      <ThemedText type="smallBold" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

function Header({ eyebrow, title, center }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <View style={[styles.header, center && styles.center]}>
      <ThemedText type="smallBold" themeColor="accent">
        {eyebrow.toUpperCase()}
      </ThemedText>
      <ThemedText style={[styles.h2, center && styles.centerText]}>{title}</ThemedText>
    </View>
  );
}

function Step({ wide, n, icon, title, desc }: { wide: boolean; n: string; icon: SFSymbol; title: string; desc: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, wide && styles.flex1, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <View style={styles.stepTop}>
        <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
          <Icon name={icon} size={22} color={theme.accent} />
        </View>
        <ThemedText style={[styles.stepNum, { color: theme.backgroundSelected }]}>{n}</ThemedText>
      </View>
      <ThemedText style={[styles.cardTitle, { color: theme.text }]}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {desc}
      </ThemedText>
    </View>
  );
}

function Feature({ wide, icon, title, desc }: { wide: boolean; icon: SFSymbol; title: string; desc: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, wide ? styles.featureWide : styles.featureFull, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
        <Icon name={icon} size={20} color={theme.accent} />
      </View>
      <ThemedText style={[styles.cardTitle, { color: theme.text }]}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {desc}
      </ThemedText>
    </View>
  );
}

function MethodPoint({ wide, icon, title, desc }: { wide: boolean; icon: SFSymbol; title: string; desc: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.methodPoint, wide && styles.flex1]}>
      <View style={[styles.iconTile, { backgroundColor: theme.card }]}>
        <Icon name={icon} size={20} color={theme.accent} />
      </View>
      <View style={styles.methodBody}>
        <ThemedText style={[styles.cardTitle, { color: theme.text }]}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {desc}
        </ThemedText>
      </View>
    </View>
  );
}

function MiniPlan({
  wide,
  name,
  price,
  note,
  items,
  highlighted,
}: {
  wide: boolean;
  name: string;
  price: string;
  note: string;
  items: string[];
  highlighted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        wide && styles.flex1,
        { backgroundColor: theme.card, borderColor: highlighted ? theme.accent : theme.border, shadowColor: theme.shadow },
        highlighted && styles.planHi,
      ]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {name}
      </ThemedText>
      <View style={styles.planPrice}>
        <ThemedText style={[styles.planPriceNum, { color: theme.text }]}>{price}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {' '}
          {note}
        </ThemedText>
      </View>
      <View style={styles.planItems}>
        {items.map((it) => (
          <View key={it} style={styles.planItem}>
            <Icon name="checkmark.circle.fill" size={16} color={theme.accent} />
            <ThemedText type="small">{it}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.faqItem, { borderColor: theme.border }]}>
      <ThemedText style={[styles.faqQ, { color: theme.text }]}>{q}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.faqA}>
        {a}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Секции
  section: { paddingTop: Spacing.six },
  grid: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  flex1: { flex: 1 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },

  // Герой
  hero: { paddingTop: Spacing.six, gap: Spacing.four },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: Spacing.six, paddingTop: 80 },
  heroText: { gap: Spacing.three },
  heroTextWide: { flex: 1.1 },
  h1: { fontFamily: Fonts.serif, fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.5 },
  h1Wide: { fontSize: 56, lineHeight: 60 },
  heroSub: { fontSize: 18, lineHeight: 28, maxWidth: 520 },
  heroCtas: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, flexWrap: 'wrap', marginTop: Spacing.one },
  heroNote: { marginTop: Spacing.one },
  ghostLink: { paddingVertical: Spacing.two },
  heroVisual: { alignItems: 'center', justifyContent: 'center' },
  heroVisualWide: { flex: 1 },

  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingVertical: 15,
    paddingHorizontal: 26,
    borderRadius: Radius.pill,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 4,
  },
  ctaLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Карточка-визуал героя
  wordCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 6,
  },
  caughtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginBottom: Spacing.one,
  },
  wordWord: { fontFamily: Fonts.serif, fontSize: 34, fontWeight: '700', marginTop: Spacing.two },
  wordExample: { marginTop: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md },

  // Доверие
  trust: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.four,
    marginTop: Spacing.five,
    paddingVertical: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  // Заголовки секций
  header: { gap: Spacing.two, marginBottom: Spacing.four },
  h2: { fontFamily: Fonts.serif, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.3 },

  // Карточки (шаги/фичи/тарифы)
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  iconTile: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  stepTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepNum: { fontSize: 44, fontWeight: '800', lineHeight: 46 },

  // Фичи-грид
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  featureWide: { flexBasis: '31%', flexGrow: 1, minWidth: 240 },
  featureFull: { width: '100%' },

  // Метод (тёплая плашка)
  method: { padding: Spacing.five, borderRadius: Radius.xxl },
  methodRows: { marginTop: Spacing.two },
  methodPoint: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  methodBody: { flex: 1, gap: Spacing.one },

  // Тарифы
  planHi: { borderWidth: 2 },
  planPrice: { flexDirection: 'row', alignItems: 'baseline' },
  planPriceNum: { fontSize: 34, fontWeight: '800' },
  planItems: { gap: Spacing.two, marginTop: Spacing.one },
  planItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  centerLink: { alignSelf: 'center', marginTop: Spacing.four, paddingVertical: Spacing.two },

  // FAQ
  faq: { gap: 0 },
  faqItem: { paddingVertical: Spacing.four, borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
  faqQ: { fontSize: 17, fontWeight: '700' },
  faqA: { maxWidth: 640 },

  // Финальный CTA
  finalCta: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six, paddingHorizontal: Spacing.four, borderRadius: Radius.xxl },
  finalTitle: { fontFamily: Fonts.serif, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  finalSub: { textAlign: 'center', maxWidth: 420 },
});
