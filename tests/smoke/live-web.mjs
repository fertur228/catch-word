/**
 * Живой smoke-набор для веб-версии TakeWord (catch-words.com).
 *
 * Проверяет РЕАЛЬНЫЙ прод + конфиг Supabase/Polar без браузера — только fetch.
 * Ловит именно deploy/config-регрессии: упавшие роуты, потерянный Polar-линк,
 * слетевшие redirect-URL, слишком низкий лимит писем (тестеры не зарегаются),
 * сломанный шаблон письма с кодом, мёртвый checkout, недоступную монетизацию.
 *
 * Запуск:  npm run test:smoke        (нужен .env с SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF)
 * Быстро:  npm run test:smoke:web    (только публичные проверки, без Management API)
 *
 * Выход: код 0 — всё зелёное; код 1 — есть падения (для CI).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// --- Конфиг проверок ---
const SITE = process.env.SMOKE_SITE ?? 'https://catch-words.com';
const POLAR_HOST = 'buy.polar.sh';
// Порог лимита писем: ниже — тестеры массово упрутся в «rate limit exceeded».
const MIN_EMAIL_RATE = 10;
// Ожидаемые цены на пейволле (должны совпадать с STATIC_PREMIUM и продуктами Polar).
const EXPECTED_PRICES = ['$6.99', '$39.99'];
// Redirect-URL, без которых ломается Google-вход на вебе.
const REQUIRED_REDIRECTS = [`${SITE.replace(/\/$/, '')}/auth-callback`];

// --- Мини-загрузчик .env (без зависимостей) ---
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env может отсутствовать — часть проверок просто пропустится */
  }
}
loadEnv();

// --- Раннер ---
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e?.message ?? e) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function fetchText(url, opts) {
  const res = await fetch(url, { redirect: 'manual', ...opts });
  const body = await res.text().catch(() => '');
  return { res, body };
}

// ==================== ПРОВЕРКИ ====================

// 1. Публичные роуты отвечают 200
const ROUTES = ['/', '/sign-in', '/pricing', '/privacy', '/terms', '/payment-success'];
for (const route of ROUTES) {
  await check(`route ${route} → 200`, async () => {
    const res = await fetch(`${SITE}${route}`, { redirect: 'follow' });
    assert(res.status === 200, `получили ${res.status}`);
  });
}

// 2. Бренд/OG в HTML главной
await check('главная: бренд TakeWord в <title>/og', async () => {
  const { body } = await fetchText(`${SITE}/`, { redirect: 'follow' });
  assert(/TakeWord/i.test(body), 'нет «TakeWord» в HTML — возможно, старый бренд/старый деплой');
  assert(/og:title/i.test(body), 'нет og-мета (SEO/шаринг)');
});

// 3. Прод-бандл цел: содержит Polar-линк, Supabase URL и ожидаемые цены
let bundleUrl = null;
await check('прод-бандл: подключён и найден', async () => {
  const { body } = await fetchText(`${SITE}/`, { redirect: 'follow' });
  const m = body.match(/\/_expo\/static\/js\/web\/[a-zA-Z0-9_.-]+\.js/);
  assert(m, 'не нашли <script> основного бандла в HTML');
  bundleUrl = `${SITE}${m[0]}`;
  return m[0];
});

let bundleBody = '';
if (bundleUrl) {
  await check('прод-бандл: скачивается', async () => {
    const res = await fetch(bundleUrl);
    assert(res.status === 200, `бандл вернул ${res.status}`);
    bundleBody = await res.text();
    return `${(bundleBody.length / 1024 / 1024).toFixed(2)} МБ`;
  });
  await check('прод-бандл: вшит Polar checkout-линк (иначе оплата на вебе мертва)', async () => {
    const m = bundleBody.match(new RegExp(`${POLAR_HOST}\\/[a-zA-Z0-9_]+`));
    assert(m, `нет ${POLAR_HOST}/... в бандле — EXPO_PUBLIC_POLAR_CHECKOUT_LINK не вшит при сборке`);
    return m[0];
  });
  await check('прод-бандл: вшит Supabase URL', async () => {
    assert(/\.supabase\.co/.test(bundleBody), 'нет *.supabase.co — EXPO_PUBLIC_SUPABASE_URL не вшит');
  });
  await check(`прод-бандл: цены планов (${EXPECTED_PRICES.join(', ')})`, async () => {
    const missing = EXPECTED_PRICES.filter((p) => !bundleBody.includes(p));
    assert(missing.length === 0, `в бандле нет цен: ${missing.join(', ')} — пейволл покажет не то`);
  });
}

// 4. Polar checkout жив (307 → страница оплаты polar.sh 200)
if (bundleBody) {
  const pm = bundleBody.match(new RegExp(`https?:\\/\\/${POLAR_HOST}\\/[a-zA-Z0-9_]+`));
  if (pm) {
    await check('Polar checkout: ссылка резолвится в живую страницу оплаты', async () => {
      const res = await fetch(pm[0], { redirect: 'follow' });
      assert(res.status === 200, `checkout вернул ${res.status}`);
      assert(/polar\.sh\/checkout/.test(res.url), `итоговый URL не похож на checkout: ${res.url}`);
      return res.url.slice(0, 60) + '…';
    });
  }
}

// 5. Монетизация «отвечает»: edge-функции живы (без ключей → 401/400, но не 404/5xx)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (SUPABASE_URL) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  await check('edge recognize: жив (401 без токена, не 404)', async () => {
    const res = await fetch(`${base}/functions/v1/recognize`, { method: 'POST' });
    assert(res.status !== 404, 'функция recognize не задеплоена (404)');
    assert(res.status < 500, `recognize вернул ${res.status}`);
    return `status ${res.status}`;
  });
  await check('edge polar-webhook: жив (не 404)', async () => {
    const res = await fetch(`${base}/functions/v1/polar-webhook`, { method: 'POST' });
    assert(res.status !== 404, 'polar-webhook не задеплоен (404)');
    assert(res.status < 500, `polar-webhook вернул ${res.status}`);
    return `status ${res.status}`;
  });
}

// 6. Конфиг Supabase Auth через Management API (нужен SUPABASE_ACCESS_TOKEN)
const MGMT = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (MGMT && REF) {
  let cfg = null;
  await check('Supabase auth config: доступен', async () => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
      headers: { Authorization: `Bearer ${MGMT}` },
    });
    assert(res.status === 200, `Management API вернул ${res.status}`);
    cfg = await res.json();
  });
  if (cfg) {
    await check('регистрация ОТКРЫТА (disable_signup=false)', async () => {
      assert(cfg.disable_signup === false, 'регистрация ВЫКЛЮЧЕНА — новые тестеры не зайдут');
    });
    await check(`лимит писем ≥ ${MIN_EMAIL_RATE}/час (иначе тестеры упрутся)`, async () => {
      const v = cfg.rate_limit_email_sent;
      assert(v >= MIN_EMAIL_RATE, `сейчас ${v}/час — при массовом тесте регистрация встанет`);
      return `${v}/час`;
    });
    await check('кастомный SMTP задан (доставка кода)', async () => {
      assert(cfg.smtp_host, 'SMTP не настроен — дефолтная почта Supabase ненадёжна');
      return cfg.smtp_host;
    });
    await check('письмо-подтверждение содержит 6-значный код {{ .Token }}', async () => {
      const t = cfg.mailer_templates_confirmation_content ?? '';
      assert(/\{\{\s*\.Token\s*\}\}/.test(t), 'в шаблоне нет .Token — экран ввода кода бесполезен');
    });
    await check('Google-вход включён', async () => {
      assert(cfg.external_google_enabled === true, 'Google выключен');
    });
    await check('redirect-URL для веб-OAuth на месте', async () => {
      const list = (cfg.uri_allow_list ?? '').split(',').map((s) => s.trim());
      const missing = REQUIRED_REDIRECTS.filter((r) => !list.includes(r));
      assert(missing.length === 0, `нет redirect: ${missing.join(', ')} — Google-вход упадёт`);
    });
  }
} else {
  results.push({
    name: 'Supabase config-проверки',
    ok: true,
    detail: 'ПРОПУЩЕНО (нет SUPABASE_ACCESS_TOKEN/REF в .env)',
    skipped: true,
  });
}

// 7. Реальные цены Polar совпадают с тем, что показываем (иначе спишется не то)
const POLAR_TOKEN = process.env.POLAR_ACCESS_TOKEN;
if (POLAR_TOKEN) {
  await check('Polar продукты: цены совпадают с пейволлом ($6.99/$39.99)', async () => {
    const res = await fetch('https://api.polar.sh/v1/products/?limit=50&is_archived=false', {
      headers: { Authorization: `Bearer ${POLAR_TOKEN}` },
      redirect: 'follow',
    });
    assert(res.status === 200, `Polar API вернул ${res.status}`);
    const data = await res.json();
    const items = data.items ?? [];
    assert(items.length > 0, 'у организации нет активных продуктов Polar');
    // Карта interval → ожидаемая цена (в центах). Недельного больше нет.
    const want = { month: 699, year: 3999 };
    const got = {};
    for (const p of items) {
      const amt = p.prices?.[0]?.price_amount;
      if (p.recurring_interval && amt != null) got[p.recurring_interval] = amt;
    }
    const mismatch = Object.entries(want)
      .filter(([k, v]) => got[k] !== v)
      .map(([k, v]) => `${k}: ждали ${(v / 100).toFixed(2)}, в Polar ${got[k] != null ? (got[k] / 100).toFixed(2) : '∅'}`);
    assert(mismatch.length === 0, mismatch.join(' | '));
    return `month $${(got.month / 100).toFixed(2)} · year $${(got.year / 100).toFixed(2)}`;
  });

  // Веб-checkout должен показывать РОВНО 2 тарифа (недельный убран из ссылки).
  await check('Polar checkout-ссылка: только Месяц + Год (без недельного)', async () => {
    const res = await fetch('https://api.polar.sh/v1/checkout-links/?limit=20', {
      headers: { Authorization: `Bearer ${POLAR_TOKEN}` },
      redirect: 'follow',
    });
    assert(res.status === 200, `Polar API вернул ${res.status}`);
    const items = (await res.json()).items ?? [];
    assert(items.length > 0, 'нет checkout-ссылок');
    const intervals = new Set();
    for (const cl of items) for (const p of cl.products ?? []) {
      if (p?.recurring_interval) intervals.add(p.recurring_interval);
    }
    assert(!intervals.has('week'), 'в checkout-ссылке всё ещё есть недельный тариф');
    assert(intervals.has('month') && intervals.has('year'), 'в ссылке нет месяц/год');
    return [...intervals].join(', ');
  });
}

// ==================== ОТЧЁТ ====================
const pass = results.filter((r) => r.ok && !r.skipped).length;
const skip = results.filter((r) => r.skipped).length;
const fail = results.filter((r) => !r.ok);

console.log(`\n  TakeWord · live web smoke  →  ${SITE}\n`);
for (const r of results) {
  const mark = r.skipped ? '⏭' : r.ok ? '✅' : '❌';
  console.log(`  ${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log(`\n  Итог: ${pass} ок · ${fail.length} упало · ${skip} пропущено\n`);

if (fail.length) {
  console.log('  ⚠️  Падения:');
  for (const r of fail) console.log(`     ❌ ${r.name}\n        ${r.detail}`);
  console.log('');
  process.exit(1);
}
process.exit(0);
