/**
 * Движок v2 (Э1–Э6): интро Повторения после входа.
 *
 * Аккаунт e2e-grade подготовлен конвейером: у него есть карточки, телеметрия
 * и записанная агентом тренировка (daily_quests.exercises) — тест проверяет
 * видимую вершину всей цепочки: hero «Тренировка от тренера» + секции плиток.
 *
 * Приложение по умолчанию на АНГЛИЙСКОЙ локали (i18n: дефолт en) — селекторы
 * здесь английские. Старые спеки с русскими плейсхолдерами — известный долг.
 */
import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'e2e-grade@catch-words.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'E2eGrade!2026';

test('движок v2: Повторение — тренировка от тренера и секции режимов', async ({ page }) => {
  page.on('dialog', (d) => {
    throw new Error(`Диалог при входе: «${d.message()}»`);
  });

  await page.goto('/sign-in');
  // react-native-web: onChangeText срабатывает при посимвольном вводе, не при fill().
  const email = page.getByPlaceholder('Enter your email');
  const pass = page.getByPlaceholder('Enter your password');
  await email.click();
  await email.pressSequentially(EMAIL, { delay: 10 });
  await pass.click();
  await pass.pressSequentially(PASSWORD, { delay: 10 });
  await pass.press('Enter');
  await page.getByText('Sign in', { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  await expect(pass).toBeHidden({ timeout: 20_000 });

  // Онбординг проскакиваем флагом (как в paywall.spec).
  await page.evaluate(() => {
    localStorage.setItem('cw.kv.onboarded', 'true');
    // Пара языков — полные коды, как в word_cards (иначе scoped-фильтр пуст).
    localStorage.setItem('cw.kv.learning_lang', 'en-US');
    localStorage.setItem('cw.kv.native_lang', 'ru-RU');
  });

  await page.goto('/review');
  // Секции интро (Э2/Э4: Диктант/Напиши сам/Расскажи о фото + старые режимы).
  await expect(page.getByText('COACH TASKS')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('QUICK QUIZZES')).toBeVisible();
  // Hero-тренировка от ночного агента (Э3): у аккаунта есть exercises на сегодня.
  await expect(page.getByText("Coach's workout", { exact: false }).first()).toBeVisible();
});
