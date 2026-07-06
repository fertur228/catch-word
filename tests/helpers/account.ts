/**
 * Идемпотентно создаёт/подтверждает тестовый аккаунт для авторизованных E2E.
 *
 * Использует Supabase admin API (SUPABASE_SERVICE_ROLE_KEY) — как QA-аккаунт для
 * Maestro. Аккаунт: email_confirm=true (минует код), profile_completed=true
 * (минует complete-profile). Онбординг E2E проскакивает через localStorage.
 *
 * Аккаунт создаётся автоматически в beforeAll paywall.spec.ts — отдельно запускать
 * не нужно. Пароль: E2E_PASSWORD или дефолт ниже.
 *
 * Чистый модуль (без import.meta/CLI) — Expo-проект собирается как CJS, и Playwright
 * транспилит ESM→CJS; import.meta здесь сломал бы загрузку.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright и npm-скрипты запускаются из корня репозитория.
function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env может отсутствовать */
  }
}
loadEnv();

export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e-web@catch-words.com';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2eWeb!Takeword2026';

let announced = false;

export async function ensureTestAccount(): Promise<{ created: boolean }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Нет EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env');

  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { profile_completed: true, first_name: 'E2E', last_name: 'Web' },
    }),
  });

  const ok = res.status === 200 || res.status === 201;
  let created = ok;
  if (!ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = String(body?.msg ?? body?.error_description ?? body?.error ?? '');
    // Уже существует — это ок (идемпотентность).
    if (res.status === 422 || /already been registered|already exists/i.test(msg)) {
      created = false;
    } else {
      throw new Error(`admin create failed: ${res.status} ${msg || JSON.stringify(body)}`);
    }
  }

  if (!announced) {
    announced = true;
    // eslint-disable-next-line no-console
    console.log(`\n  [e2e] аккаунт ${created ? 'создан' : 'готов'}: ${E2E_EMAIL} / ${E2E_PASSWORD}\n`);
  }
  return { created };
}
