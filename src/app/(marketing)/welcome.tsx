/**
 * Лендинг CatchWord (/welcome) — минималистичный, в духе нативных iOS/SwiftUI-
 * приложений: фиксированная тёмно-серая палитра (не зависит от темы), SF-
 * типографика, сгруппированные inset-списки с hairline-разделителями, крупный
 * тайтл, монохром, белая capsule-кнопка. Структура — по YC (hero → как работает
 * → возможности → тарифы → FAQ → CTA). Веб-first, но на RN-примитивах.
 */
import type { ReactNode } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { PRIVACY_URL, SITE_URL, SUPPORT_EMAIL, TERMS_URL } from '@/constants/links';

/** Фиксированная тёмно-серая палитра (Apple-like). Один тон — без ярких акцентов. */
const C = {
  bg: '#0C0C0E',
  elev: '#161619',
  tile: '#232327',
  hair: 'rgba(255,255,255,0.08)',
  text: '#F5F5F7',
  text2: '#98989F',
  text3: '#66666D',
  icon: '#D0D0D6',
  cta: '#F5F5F7',
  ctaText: '#0C0C0E',
};

/** Системный шрифт (SF на Apple). */
const SF = Platform.select({ web: 'system-ui', default: 'System' }) as string;

const HOW: { icon: SFSymbol; title: string; sub: string }[] = [
  { icon: 'camera.fill', title: 'Наведи камеру', sub: 'На любой предмет вокруг — дома, на улице, в кафе.' },
  { icon: 'sparkles', title: 'Поймай слово', sub: 'AI даёт слово, перевод, транскрипцию и живые примеры.' },
  { icon: 'arrow.triangle.2.circlepath', title: 'Запоминай', sub: 'Карточка вернётся на повтор ровно в нужный момент.' },
];

const FEATURES: { icon: SFSymbol; title: string; sub: string }[] = [
  { icon: 'sparkles', title: 'Умное распознавание', sub: 'Примеры, мнемоника и подсказки в одном касании.' },
  { icon: 'square.grid.2x2', title: 'Вся сцена', sub: 'До 8 предметов за один кадр.' },
  { icon: 'arrow.triangle.2.circlepath', title: 'Интервальные повторения', sub: 'Выверенный график повторов — слова остаются надолго.' },
  { icon: 'rectangle.stack.fill', title: 'Коллекция-стикеры', sub: 'Каждое слово — вырезанный стикер предмета.' },
  { icon: 'speaker.wave.2.fill', title: 'Произношение', sub: 'Слушай, как звучит слово, и повторяй вслух.' },
  { icon: 'globe', title: 'Все языки', sub: 'Любая пара языков в Premium, на всех устройствах.' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'CatchWord бесплатный?', a: '10 сканов бесплатно навсегда, без карты. Premium снимает лимит и открывает все языки.' },
  { q: 'Нужен интернет?', a: 'Для распознавания — да. Коллекция и повторение работают и офлайн.' },
  { q: 'Где работает?', a: 'В браузере и как приложение — прогресс синхронизируется между устройствами.' },
  { q: 'Как отменить Premium?', a: 'В любой момент, без скрытых списаний.' },
];

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const big = width >= 700;

  const onStart = () => router.push('/sign-in');

  return (
    <View style={styles.page}>
      <Head>
        <title>CatchWord — учи английский по фото: наведи камеру и лови слова</title>
        <meta
          name="description"
          content="CatchWord превращает мир вокруг в словарь: наведи камеру на предмет — получи слово, перевод, произношение и карточку с интервальным повторением. 10 сканов бесплатно, без карты."
        />
        <link rel="canonical" href={`${SITE_URL}/welcome`} />
        <meta property="og:title" content="CatchWord — учи язык через камеру" />
        <meta
          property="og:description"
          content="Наведи камеру на предмет — поймай слово, перевод, произношение и карточку для повторения. 10 сканов бесплатно."
        />
        <meta property="og:url" content={`${SITE_URL}/welcome`} />
        <meta property="og:image" content={`${SITE_URL}/og.png`} />
      </Head>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <TopBar />

        <View style={styles.container}>
          {/* ── HERO ── */}
          <View style={styles.hero}>
            <Text style={[styles.h1, { fontSize: big ? 56 : 40, lineHeight: big ? 60 : 44, letterSpacing: big ? -1.4 : -1 }]}>
              Мир вокруг —{'\n'}твой словарь.
            </Text>
            <Text style={styles.heroSub}>
              Наведи камеру на любой предмет — получи слово, перевод, произношение и карточку,
              которая сама вернётся на повтор.
            </Text>
            <View style={styles.heroCtas}>
              <Cta label="Начать бесплатно" onPress={onStart} />
              <Pressable onPress={onStart} hitSlop={8}>
                <Text style={styles.link}>Войти →</Text>
              </Pressable>
            </View>
            <Text style={styles.heroNote}>10 сканов бесплатно · без карты</Text>

            <WordCard />
          </View>

          {/* ── HOW ── */}
          <Section header="Как это работает">
            <Group>
              {HOW.map((r, i) => (
                <Row key={r.title} icon={r.icon} title={r.title} sub={r.sub} last={i === HOW.length - 1} />
              ))}
            </Group>
          </Section>

          {/* ── FEATURES ── */}
          <Section header="Возможности">
            <Group>
              {FEATURES.map((r, i) => (
                <Row key={r.title} icon={r.icon} title={r.title} sub={r.sub} last={i === FEATURES.length - 1} />
              ))}
            </Group>
          </Section>

          {/* ── PRICING ── */}
          <Section header="Тарифы">
            <Group>
              <PriceRow name="Free" sub="10 сканов · один язык" price="$0" />
              <PriceRow name="Premium" sub="Безлимит · все языки · вся сцена" price="$6.99 / мес" last />
            </Group>
            <Pressable onPress={() => router.push('/pricing')} hitSlop={8} style={styles.moreLink}>
              <Text style={styles.link}>Все тарифы →</Text>
            </Pressable>
          </Section>

          {/* ── FAQ ── */}
          <Section header="Вопросы">
            <Group>
              {FAQ.map((r, i) => (
                <Row key={r.q} title={r.q} sub={r.a} last={i === FAQ.length - 1} />
              ))}
            </Group>
          </Section>

          {/* ── FINAL CTA ── */}
          <View style={styles.finalCta}>
            <Text style={styles.finalTitle}>Начни ловить слова сегодня</Text>
            <Text style={styles.finalSub}>Открой камеру — и первое слово уже твоё.</Text>
            <Cta label="Начать бесплатно" onPress={onStart} />
          </View>

          <Footer />
        </View>
      </ScrollView>
    </View>
  );
}

// ── Компоненты ────────────────────────────────────────────────────────────────

function TopBar() {
  const router = useRouter();
  return (
    <View style={styles.topbar}>
      <View style={styles.topbarInner}>
        <Pressable onPress={() => router.push('/welcome')} hitSlop={6}>
          <Text style={styles.brand}>CatchWord</Text>
        </Pressable>
        <View style={styles.topbarRight}>
          <Pressable onPress={() => router.push('/pricing')} hitSlop={8}>
            <Text style={styles.navLink}>Тарифы</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/sign-in')} hitSlop={8}>
            <Text style={styles.navSignIn}>Войти</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Белая capsule-кнопка (Apple-like). */
function Cta({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
      <Text style={styles.ctaLabel}>{label}</Text>
    </Pressable>
  );
}

function Section({ header, children }: { header: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{header.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** Сгруппированная inset-карточка (как секция iOS Settings). */
function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({ icon, title, sub, last }: { icon?: SFSymbol; title: string; sub?: string; last?: boolean }) {
  return (
    <View>
      <View style={styles.row}>
        {icon ? (
          <View style={styles.tile}>
            <Icon name={icon} size={18} color={C.icon} />
          </View>
        ) : null}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{title}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
      </View>
      {!last ? <View style={[styles.sep, { marginLeft: icon ? 60 : 16 }]} /> : null}
    </View>
  );
}

function PriceRow({ name, sub, price, last }: { name: string; sub: string; price: string; last?: boolean }) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={styles.rowSub}>{sub}</Text>
        </View>
        <Text style={styles.price}>{price}</Text>
      </View>
      {!last ? <View style={[styles.sep, { marginLeft: 16 }]} /> : null}
    </View>
  );
}

/** Минимальная карточка-визуал: «пойманное слово». */
function WordCard() {
  return (
    <View style={styles.wordCard}>
      <Text style={styles.wordCaught}>ПОЙМАНО</Text>
      <View style={styles.wordMain}>
        <View style={styles.wordTile}>
          <Icon name="cup.and.saucer.fill" size={22} color={C.icon} />
        </View>
        <View>
          <Text style={styles.wordWord}>coffee</Text>
          <Text style={styles.wordTrans}>кофе · /ˈkɒf.i/</Text>
        </View>
      </View>
      <View style={styles.wordSep} />
      <Text style={styles.wordExample}>«Two coffees, please.»</Text>
    </View>
  );
}

function Footer() {
  const router = useRouter();
  return (
    <View style={styles.footer}>
      <Text style={styles.footerCopy}>© CatchWord</Text>
      <View style={styles.footerLinks}>
        <FooterLink label="Тарифы" onPress={() => router.push('/pricing')} />
        <FooterLink label="Конфиденциальность" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <FooterLink label="Условия" onPress={() => Linking.openURL(TERMS_URL)} />
        <FooterLink label="Поддержка" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
      </View>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={styles.footerLink}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 56 },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 24 },

  // Топбар
  topbar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  topbarInner: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 24,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontFamily: SF, fontSize: 17, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  navLink: { fontFamily: SF, fontSize: 15, fontWeight: '500', color: C.text2 },
  navSignIn: { fontFamily: SF, fontSize: 15, fontWeight: '600', color: C.text },

  // Герой
  hero: { paddingTop: 72 },
  h1: { fontFamily: SF, fontWeight: '700', color: C.text },
  heroSub: { fontFamily: SF, fontSize: 18, lineHeight: 27, color: C.text2, maxWidth: 540, marginTop: 18 },
  heroCtas: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 30 },
  heroNote: { fontFamily: SF, fontSize: 13, color: C.text3, marginTop: 16 },
  link: { fontFamily: SF, fontSize: 15, fontWeight: '600', color: C.text2 },

  // Кнопка
  cta: {
    backgroundColor: C.cta,
    borderRadius: 980,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: { fontFamily: SF, fontSize: 16, fontWeight: '600', color: C.ctaText, letterSpacing: -0.2 },

  // Карточка-визуал
  wordCard: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 420,
    marginTop: 40,
    padding: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hair,
    backgroundColor: C.elev,
    gap: 14,
  },
  wordCaught: { fontFamily: SF, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: C.text3 },
  wordMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  wordTile: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' },
  wordWord: { fontFamily: SF, fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  wordTrans: { fontFamily: SF, fontSize: 14, color: C.text2, marginTop: 2 },
  wordSep: { height: StyleSheet.hairlineWidth, backgroundColor: C.hair },
  wordExample: { fontFamily: SF, fontSize: 14, color: C.text2 },

  // Секции
  section: { marginTop: 60 },
  sectionHeader: { fontFamily: SF, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.6, color: C.text3, marginLeft: 8, marginBottom: 12 },

  // Сгруппированный список
  group: { backgroundColor: C.elev, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hair, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  tile: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 3, paddingTop: 1 },
  rowTitle: { fontFamily: SF, fontSize: 16, fontWeight: '500', color: C.text, lineHeight: 21, letterSpacing: -0.2 },
  rowSub: { fontFamily: SF, fontSize: 14, color: C.text2, lineHeight: 19 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.hair },
  price: { fontFamily: SF, fontSize: 16, fontWeight: '600', color: C.text, marginTop: 1 },
  moreLink: { alignSelf: 'flex-start', marginTop: 14, marginLeft: 4 },

  // Финальный CTA
  finalCta: { alignItems: 'center', marginTop: 72, gap: 14 },
  finalTitle: { fontFamily: SF, fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: C.text, textAlign: 'center' },
  finalSub: { fontFamily: SF, fontSize: 16, color: C.text2, textAlign: 'center', maxWidth: 380, lineHeight: 23 },

  // Футер
  footer: {
    marginTop: 72,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hair,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  footerCopy: { fontFamily: SF, fontSize: 13, color: C.text3 },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  footerLink: { fontFamily: SF, fontSize: 13, color: C.text2 },
});
