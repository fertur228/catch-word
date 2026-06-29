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
        <meta name="theme-color" content="#208AEF" />

        {/* Базовые SEO/соц-мета (per-page <Head> переопределяет на клиенте). */}
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
        <meta property="og:type" content="website" />

        {/* Веб-шрифты для CSS-переменных темы (Spline Sans = display, Inter = body). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Spline+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* Сбрасывает скролл-поведение, чтобы body скроллился как в нативе. */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
