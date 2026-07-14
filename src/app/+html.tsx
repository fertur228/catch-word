/**
 * Корневой HTML-документ ТОЛЬКО для веба (статический рендер Expo Router).
 * На нативе игнорируется. Здесь подключаем веб-шрифты, на которые ссылается
 * web-ветка src/constants/theme.ts (CSS-переменные --font-display и т.п.,
 * объявлены в src/global.css), задаём язык/viewport и базовые meta.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#1C1C1E" />

        {/* Базовые SEO/соц-мета (per-page <Head> переопределяет на клиенте). */}
        <title>TakeWord — учи язык через камеру</title>
        <meta
          name="description"
          content="Наведи камеру на любой предмет — поймай слово, перевод, произношение и карточку для повторения. Учись там, где живёшь."
        />
        <meta property="og:title" content="TakeWord — учи язык через камеру" />
        <meta
          property="og:description"
          content="Наведи камеру на предмет — поймай слово и карточку для повторения."
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TakeWord" />
        <meta property="og:url" content="https://app.catch-words.com/" />
        <meta property="og:image" content="https://app.catch-words.com/og.png" />
        <meta property="og:locale" content="ru_RU" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TakeWord — учи язык через камеру" />
        <meta
          name="twitter:description"
          content="Наведи камеру на предмет — поймай слово, перевод, произношение и карточку."
        />
        <meta name="twitter:image" content="https://app.catch-words.com/og.png" />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta
          name="keywords"
          content="учить английский по фото, приложение для изучения слов, учить язык через камеру, интервальные повторения, флеш-карточки, распознавание предметов, TakeWord"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="TakeWord" />
        <link rel="apple-touch-icon" href="/favicon.png" />

        {/* Шрифт — системный (как в нативной аппке), внешние веб-шрифты не грузим. */}

        {/* Структурированные данные (JSON-LD) — для rich-результатов и GEO/AI-поиска.
            Это настоящий DOM-<script>, поэтому попадает в статический HTML (в отличие
            от <script> внутри expo-router/head). Сайт-wide: приложение + организация. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  name: 'TakeWord',
                  url: 'https://app.catch-words.com/',
                  logo: 'https://app.catch-words.com/og.png',
                },
                {
                  '@type': 'SoftwareApplication',
                  name: 'TakeWord',
                  applicationCategory: 'EducationalApplication',
                  operatingSystem: 'iOS, Web',
                  url: 'https://app.catch-words.com/',
                  inLanguage: 'ru',
                  description:
                    'Учи язык через камеру: наведи на предмет — получи слово, перевод, произношение и карточку с интервальным повторением.',
                  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                },
              ],
            }),
          }}
        />

        {/* Сбрасывает скролл-поведение, чтобы body скроллился как в нативе. */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
