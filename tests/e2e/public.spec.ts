import { test, expect, type Page } from '@playwright/test';

/**
 * Публичный customer-путь (без входа): лендинг, вход, тарифы, юр-страницы.
 * Гоняется против живого прода. Ловит: белый экран, JS-краш при загрузке,
 * пропавший контент/форму входа, слетевшие цены на маркетинге.
 */

// Собираем НЕОЖИДАННЫЕ ошибки страницы (реальные краши, не сетевой шум).
function trackFatalErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('Публичные страницы', () => {
  test('лендинг /welcome — рендерится и рассказывает суть', async ({ page }) => {
    const errors = trackFatalErrors(page);
    await page.goto('/welcome');
    // Ключевые смысловые блоки лендинга (react-native-web → текст в DOM).
    // Маркетинговые страницы (marketing)/ НЕ обёрнуты в t() — текст остаётся русским.
    await expect(page.getByText(/Наведи камеру/i).first()).toBeVisible();
    await expect(page.getByText(/Поймай слово/i).first()).toBeVisible();
    expect(errors, `JS-краши: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('вход /sign-in — форма на месте и интерактивна', async ({ page }) => {
    await page.goto('/sign-in');
    // Поля email/пароль (по placeholder) + кнопки входа.
    // Приложение по умолчанию на en — строки из src/lib/i18n-en.ts.
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Continue with Google/i)).toBeVisible();
    await expect(page.getByText(/Sign up/i)).toBeVisible();
    // Поле реально принимает ввод.
    await page.getByPlaceholder('Enter your email').fill('probe@example.com');
    await expect(page.getByPlaceholder('Enter your email')).toHaveValue('probe@example.com');
  });

  test('тарифы /pricing — цены совпадают с реальными (Polar)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/Простые тарифы/i)).toBeVisible();
    // Только два тарифа: $6.99 мес и $39.99 год (недельный убран).
    await expect(page.getByText('$6.99').first()).toBeVisible();
    await expect(page.getByText(/\$39\.99/).first()).toBeVisible();
    // Недельного $4.99 на странице быть не должно.
    await expect(page.getByText(/\$4\.99/)).toHaveCount(0);
  });

  test('юр-страницы /privacy и /terms — не пустые', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByText(/Конфиденциальн|Privacy|данны/i).first()).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByText(/Услови|EULA|Terms|соглашени/i).first()).toBeVisible();
  });

  test('оплата /payment-success — открывается без краша (без checkout_id → мягкое состояние)', async ({
    page,
  }) => {
    const errors = trackFatalErrors(page);
    await page.goto('/payment-success');
    // Экран показывает какое-то из состояний (проверка/успех/ждём) — не белый экран.
    // Экран обёрнут в t() → английские строки из i18n-en.ts.
    await expect(
      page.getByText(/Checking your payment|Premium activated|Payment received/i).first(),
    ).toBeVisible();
    expect(errors, `JS-краши: ${errors.join('; ')}`).toHaveLength(0);
  });
});
