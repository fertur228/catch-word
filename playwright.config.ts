import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E для веб-версии TakeWord.
 *
 * По умолчанию гоняем против ЖИВОГО прода (catch-words.com), чтобы ловить именно
 * то, что видят тестеры. Можно нацелить на локальную сборку/превью через BASE_URL.
 *
 *   npm run test:e2e            # весь набор против прода
 *   npm run test:e2e:ui        # интерактивный режим
 *   BASE_URL=http://localhost:8081 npm run test:e2e
 *
 * Авторизованные сценарии требуют тестового аккаунта — см. tests/helpers/account.mjs
 * и переменные E2E_EMAIL / E2E_PASSWORD (создаются npm run test:e2e:account).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL ?? 'https://catch-words.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ru-RU',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // Мобильный Safari — критичный кейс: камера на iOS через input[capture].
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
