import { test, expect, type Page } from '@playwright/test';
import { ensureTestAccount, E2E_EMAIL, E2E_PASSWORD } from '../helpers/account';

/**
 * Авторизованный customer-путь: вход → приложение → пейволл → уход на оплату.
 * Это тест САМОЙ монетизации: клик по тарифу должен вести на Polar checkout
 * с reference_id = UUID пользователя (иначе вебхук не поймёт, кому выдать доступ).
 *
 * Тестовый аккаунт создаётся автоматически (Supabase admin). Онбординг
 * проскакиваем через localStorage['cw.kv.onboarded'].
 */

test.beforeAll(async () => {
  await ensureTestAccount();
});

/**
 * ВАЖНО про гейт (_layout.tsx): для авторизованного юзера с profile_completed и
 * onboarded=true гейт НЕ делает редиректа. Поэтому онбординг-флаг НЕЛЬЗЯ ставить
 * ДО входа — иначе после логина гейт не уводит с /sign-in и кажется, что вход не
 * прошёл. Ставим флаг ПОСЛЕ входа (uxProceedToApp) и только тогда идём на /paywall.
 */
async function login(page: Page) {
  // Ошибку входа приложение показывает через window.alert (dialog.web) — не глотаем её молча.
  page.on('dialog', (d) => {
    throw new Error(`Диалог при входе: «${d.message()}»`);
  });

  await page.goto('/sign-in');
  // react-native-web: onChangeText надёжно срабатывает при посимвольном вводе,
  // а не при .fill() — иначе React-state пуст и кнопка «Войти» остаётся disabled.
  const emailField = page.getByPlaceholder('Введите email');
  const passField = page.getByPlaceholder('Введите пароль');
  await emailField.click();
  await emailField.pressSequentially(E2E_EMAIL, { delay: 10 });
  await passField.click();
  await passField.pressSequentially(E2E_PASSWORD, { delay: 10 });

  // Сабмит через Enter (поле пароля: returnKeyType="go" + onSubmitEditing=onLogin) —
  // надёжнее клика по RNW-кнопке. Клик оставляем запасным вариантом.
  await passField.press('Enter');
  await page
    .getByText('Войти', { exact: true })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});

  // Ждём ухода со страницы входа: без онбординг-флага гейт уводит на /onboarding —
  // это и есть доказательство, что вход прошёл (форма входа исчезла).
  await expect(passField).toBeHidden({ timeout: 20_000 });
}

/** После входа проскакиваем онбординг (флаг в localStorage) и открываем пейволл. */
async function openPaywall(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('cw.kv.onboarded', 'true');
    localStorage.setItem('cw.kv.learning_lang', 'en');
    localStorage.setItem('cw.kv.native_lang', 'ru');
  });
  await page.goto('/paywall');
  await expect(page.getByText(/Учи быстрее с Premium/i)).toBeVisible({ timeout: 20_000 });
}

test('вход по email/паролю — пускает внутрь приложения', async ({ page }) => {
  await login(page);
  // Мы больше не на форме входа — значит сессия применилась.
  expect(page.url()).not.toContain('/sign-in');
});

test('регрессия: вернувшийся юзер (онбординг пройден) не залипает на /sign-in', async ({ page }) => {
  // Онбординг-флаг ДО входа воспроизводит вернувшегося юзера (после логаута флаг
  // остаётся). До фикса гейта вход проходил, но экран входа не сменялся.
  // ⚠️ Красный, пока фикс _layout.tsx не задеплоен на прод.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cw.kv.onboarded', 'true');
      localStorage.setItem('cw.kv.learning_lang', 'en');
      localStorage.setItem('cw.kv.native_lang', 'ru');
    } catch {}
  });
  await login(page);
  expect(page.url()).not.toContain('/sign-in');
});

test('пейволл — показывает планы и реальные цены', async ({ page }) => {
  await login(page);
  await openPaywall(page);
  await expect(page.getByText('$6.99').first()).toBeVisible();
  await expect(page.getByText(/\$39\.99/).first()).toBeVisible();
  // Годовой тариф с триалом и бейджем «Выгодно».
  await expect(page.getByText(/7 дней бесплатно/i).first()).toBeVisible();
});

test('монетизация — клик по годовому тарифу ведёт на Polar с reference_id', async ({ page }) => {
  await login(page);
  await openPaywall(page);

  // Перехватываем переход на Polar, НЕ создавая реальный checkout.
  let polarUrl: string | null = null;
  await page.route('**buy.polar.sh/**', (route) => {
    polarUrl = route.request().url();
    return route.abort();
  });

  await page.getByText(/Начать 7 дней бесплатно/i).first().click();

  // Дождаться, что перехват сработал.
  await expect
    .poll(() => polarUrl, { timeout: 15_000, message: 'клик не увёл на buy.polar.sh' })
    .not.toBeNull();

  expect(polarUrl!).toContain('buy.polar.sh');
  // Главное: подписка привязана к аккаунту — иначе вебхук не выдаст доступ.
  expect(polarUrl!, 'нет reference_id — вебхук не поймёт, кому выдать premium').toMatch(
    /reference_id=[0-9a-f-]{36}/i,
  );
});
