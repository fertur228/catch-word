/**
 * Политика конфиденциальности (/privacy). Двуязычная (RU по умолчанию + EN),
 * переключатель вверху. Текст сверен с фактическим поведением приложения:
 * НЕ добавляем данные, которые не собираем (аналитика, геолокация, реклама — их нет).
 * Рабочая основа, не юридическая консультация.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Head from 'expo-router/head';

import { LegalPage, type LegalSection } from '@/components/legal-page';
import { ThemedText } from '@/components/themed-text';
import { SUPPORT_EMAIL } from '@/constants/links';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Locale = 'ru' | 'en';

const CONTENT: Record<Locale, { title: string; updated: string; sections: LegalSection[] }> = {
  ru: {
    title: 'Политика конфиденциальности',
    updated: 'Обновлено: 7 июля 2026',
    sections: [
      {
        h: 'Какие данные мы собираем',
        p: [
          'Аккаунт: при входе через Apple или Google мы получаем ваш email и идентификатор аккаунта, а также имя, если вы решили им поделиться, — чтобы сохранять и синхронизировать вашу коллекцию слов между устройствами. Если вы используете «Скрыть e-mail» от Apple, мы работаем с его релейным адресом.',
          'Фотографии: снимок предмета отправляется на наш сервер распознавания только для того, чтобы определить слово. Мы не используем его для рекламы и не публикуем.',
          'Учебные данные: слова, переводы, прогресс повторений и (по желанию) вырезанные изображения предметов.',
          'Подписка: если вы оформляете Premium, мы получаем статус подписки (активна, пробный период или истекла). Данные банковской карты мы не получаем — оплата полностью проходит на стороне Apple.',
        ],
      },
      {
        h: 'Как мы используем данные',
        p: [
          'Чтобы распознавать предметы, формировать карточки, озвучивать слова и напоминать о повторении.',
          'Чтобы синхронизировать вашу коллекцию между телефоном и браузером, когда вы вошли в аккаунт.',
          'Чтобы предоставлять и учитывать доступ к платным функциям Premium.',
        ],
      },
      {
        h: 'Подписки и платежи',
        p: [
          'Premium оформляется как подписка с автопродлением через встроенные покупки Apple (In-App Purchase). Оплату и данные карты обрабатывает Apple; мы их не видим и не храним.',
          'Статус подписки мы получаем через сервис RevenueCat, чтобы открывать премиум-функции на всех ваших устройствах. Управлять подпиской и отменять её можно в настройках Apple ID.',
        ],
      },
      {
        h: 'Кому передаём',
        p: [
          'Supabase — хранение базы данных, файлов и авторизация.',
          'Поставщик распознавания (через OpenRouter / Google Gemini) — обработка фотографии для определения предмета.',
          'Apple — вход через Apple и обработка покупок Premium.',
          'RevenueCat — управление статусом подписки.',
          'Мы не продаём ваши персональные данные и не передаём их рекламным сетям.',
        ],
      },
      {
        h: 'Хранение и удаление',
        p: [
          'Без входа данные хранятся только на вашем устройстве (в браузере).',
          'Данные вошедшего аккаунта хранятся, пока существует аккаунт.',
        ],
      },
      {
        h: 'Ваши права',
        p: [
          'Вы можете в любой момент очистить коллекцию в приложении.',
          'Вы можете удалить аккаунт и все связанные с ним данные прямо в приложении: Настройки → Удалить аккаунт. Это действие необратимо. Также можно написать нам, и мы удалим ваши данные.',
        ],
      },
      {
        h: 'Дети',
        p: [
          'Приложение не предназначено для детей младше 13 лет, и мы сознательно не собираем их персональные данные. Если вы считаете, что ребёнок предоставил нам данные, напишите нам — и мы их удалим.',
        ],
      },
      {
        h: 'Изменения политики',
        p: [
          'Мы можем время от времени обновлять эту политику. Актуальная дата указана вверху страницы; существенные изменения мы отразим здесь.',
        ],
      },
      {
        h: 'Контакты',
        p: [`По вопросам конфиденциальности: ${SUPPORT_EMAIL}.`],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Updated: July 7, 2026',
    sections: [
      {
        h: 'What data we collect',
        p: [
          'Account: when you sign in with Apple or Google, we receive your email address and an account identifier, and your name if you choose to share it — so we can save and sync your word collection across devices. If you use Apple’s “Hide My Email,” we work with Apple’s relay address.',
          'Photos: a photo of an object is sent to our recognition server solely to identify the word. We do not use it for advertising and do not publish it.',
          'Learning data: words, translations, review progress, and (optionally) cut-out images of objects.',
          'Subscription: if you purchase Premium, we receive your subscription status (active, trial, or expired). We do not receive your payment card details — payment is handled entirely by Apple.',
        ],
      },
      {
        h: 'How we use data',
        p: [
          'To recognize objects, build cards, pronounce words, and remind you to review.',
          'To sync your collection between your phone and browser when you are signed in.',
          'To provide and manage access to paid Premium features.',
        ],
      },
      {
        h: 'Subscriptions and payments',
        p: [
          'Premium is an auto-renewable subscription purchased through Apple In-App Purchase. Payment and card details are processed by Apple; we neither see nor store them.',
          'We receive your subscription status through the RevenueCat service so we can unlock Premium features across your devices. You can manage or cancel your subscription in your Apple ID settings.',
        ],
      },
      {
        h: 'Who we share with',
        p: [
          'Supabase — database and file storage, and authentication.',
          'Recognition provider (via OpenRouter / Google Gemini) — processing the photo to identify the object.',
          'Apple — Sign in with Apple and processing Premium purchases.',
          'RevenueCat — managing subscription status.',
          'We do not sell your personal data and do not share it with advertising networks.',
        ],
      },
      {
        h: 'Storage and deletion',
        p: [
          'Without signing in, data is stored only on your device (in your browser).',
          'Data for a signed-in account is stored for as long as the account exists.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'You can clear your collection in the app at any time.',
          'You can delete your account and all associated data directly in the app: Settings → Delete account. This action is irreversible. You may also contact us and we will delete your data.',
        ],
      },
      {
        h: 'Children',
        p: [
          'The app is not intended for children under 13, and we do not knowingly collect their personal data. If you believe a child has provided us with data, contact us and we will delete it.',
        ],
      },
      {
        h: 'Changes to this policy',
        p: [
          'We may update this policy from time to time. The current date is shown at the top of this page; we will reflect any material changes here.',
        ],
      },
      {
        h: 'Contact',
        p: [`For privacy questions: ${SUPPORT_EMAIL}.`],
      },
    ],
  },
};

/** Переключатель языка RU / EN — маленький сегментированный контрол. */
function LangToggle({ value, onChange }: { value: Locale; onChange: (l: Locale) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.toggle, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {(['ru', 'en'] as const).map((l) => {
        const active = value === l;
        return (
          <Pressable
            key={l}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(l)}
            style={[styles.toggleBtn, active ? { backgroundColor: theme.primary } : null]}>
            <ThemedText type="smallBold" style={{ color: active ? '#FFFFFF' : theme.textSecondary }}>
              {l.toUpperCase()}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Privacy() {
  const [locale, setLocale] = useState<Locale>('ru');
  const c = CONTENT[locale];
  return (
    <>
      <Head>
        <title>Конфиденциальность — TakeWord</title>
        <meta name="description" content="Как TakeWord обрабатывает ваши данные." />
      </Head>
      <LegalPage
        title={c.title}
        updated={c.updated}
        sections={c.sections}
        topSlot={<LangToggle value={locale} onChange={setLocale} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
});
