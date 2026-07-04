# TakeWord — монетизация: решение и план

> Обновлено: 2026-07-03. Тарифы ниже — ПО ФАКТУ КОДА (`src/screens/paywall-screen.tsx`),
> а не по старой спеке §8. Этот файл фиксирует, ЧЕМ принимать оплату и почему,
> плюс чек-лист запуска.

## Решение
**Для подписки внутри iOS-приложения — RevenueCat поверх Apple In-App Purchase.**
Polar и Dodo Payments рассматриваем **только позже** и **только для веба** (или US-обхода комиссии через внешнюю ссылку).

## Почему (главное правило Apple)
Цифровую подписку, которую потребляют **внутри iOS-приложения**, Apple требует продавать через свой **In-App Purchase (StoreKit)**. Сторонние процессоры (Polar, Dodo, Stripe, Paddle) внутри приложения **запрещены** — есть единственное исключение: **внешние ссылки на оплату только в US-сторфронте** (после дела Epic, 2025). Это US-only, ухудшает UX и повышает риск ревью (а у нас 4+/AI — Apple придирчив, спека §12).

## Сравнение
| | **RevenueCat** | **Polar / Dodo** |
|---|---|---|
| Что это | надстройка над Apple IAP + Google Play (мобайл) | Merchant of Record (веб/SaaS), держит налоги |
| Где платит юзер | нативный платёж в приложении | веб-checkout (на iOS — только US внешняя ссылка) |
| Комиссия | Apple **15%** (Small Business) + RevenueCat (бесплатно до ~$2.5k/мес, далее ~1%) | ~4%+ (Polar/Dodo), Apple 0% на внешний US-платёж |
| Налоги/MoR | держит Apple | держит Polar/Dodo |
| Риск App Review | минимальный | выше (US-only, AI/4+) |
| Когда брать | **подписка в iOS-аппе (наш случай)** | веб-воронка / US-обход позже |

> RevenueCat умеет «app-to-web», поэтому старт на нём не закрывает дорогу к Polar/Dodo позже без переписывания экранов.

## Чек-лист запуска оплаты (слой 2)
**Аккаунты и юридическое (без этого вкладка подписок не появится):**
- [ ] Apple Developer Program — **$99/год** (свой или инкубаторский).
- [ ] App Store Connect → Agreements, Tax, and Banking: подписать **Paid Applications Agreement**, заполнить **банк** и **налоги**.
- [ ] Подать в **Small Business Program** → комиссия **15%** вместо 30% (важно для юнит-экономики §9).

**Продукты в App Store Connect:**
- [ ] Создать **Subscription Group** «TakeWord Premium».
- [ ] Продукты: **Premium месяц** ($6.99) и **Premium год** ($39.99) — оба дают один entitlement `premium`.
- [ ] **7-дневный триал** = intro-offer на ГОДОВОМ продукте.
- [ ] Basic и Lifetime в коде НЕ реализованы — добавлять только если решим расширять сетку.

**Тексты продуктов для ASC (локализация RU + EN).** Display Name — короткое
(Apple ≤30 симв.); Description — 1–2 предложения (если ASC заругается на длину,
обрежь до первого предложения).

**Premium — месяц ($6.99)**
- Display Name (RU): `TakeWord Premium (месяц)`
- Description (RU): `Учи слова, наводя камеру на что угодно. Premium снимает все лимиты: безлимитные сканы, все языки, умный тест без ограничений, режим «Вся сцена», 2–3 живых примера с грамматикой и экспорт коллекции. Продление каждый месяц.`
- Display Name (EN): `TakeWord Premium (Monthly)`
- Description (EN): `Learn words by pointing your camera at anything. Premium removes every limit: unlimited scans, all languages, unlimited smart tests, whole-scene capture, 2–3 living examples with grammar, and collection export. Renews monthly.`

**Premium — год ($39.99)**
- Display Name (RU): `TakeWord Premium (год)`
- Description (RU): `Всё то же, что в месячной подписке, только сразу на год — и выгоднее: безлимитные сканы, все языки, умный тест без ограничений, «Вся сцена», примеры с грамматикой и экспорт. Плюс 7 дней бесплатно. Продление раз в год.`
- Display Name (EN): `TakeWord Premium (Yearly)`
- Description (EN): `Everything in the monthly plan, but for a full year — and cheaper: unlimited scans, all languages, unlimited smart tests, whole-scene capture, examples with grammar, and export. Plus 7 days free. Renews yearly.`

**RevenueCat:**
- [ ] Проект + подключить App Store (app-specific shared secret).
- [ ] Завести **entitlement** `premium`, привязать продукты.
- [ ] SDK `react-native-purchases`, пейволл (можно Paywalls v2 no-code).
- [ ] Протестировать в **Sandbox**: покупка/восстановление/триал/отмена.

**App Review (особенно 4+/AI):**
- [ ] Раскрыть цену, период, **авто-продление**; кнопка **«Восстановить покупки»**.
- [ ] Ссылки на **Privacy Policy** и **Terms**.
- [ ] Не ставить категорию **«Kids»** (там жёстче) — у нас обычная «образование», возраст 4+.

## Тарифы (актуально — как в коде)
Две ступени: **Free** и **Premium**. Premium — одна подписка с выбором периода (месяц/год),
один entitlement `premium`. Basic и Lifetime из старой спеки в коде НЕ реализованы.

**Free — $0, навсегда**
- 3 скана **в день** (сброс в UTC-полночь; сервер `consume_scan`)
- До 2 пар языков (курсов) — язык менять можно, но 3-я пара → Premium
- 1 пример на слово, **без мнемоники** («как запомнить»)
- 1 умный тест в день

**Premium — $6.99/мес · $39.99/год**
- Годовой — бейдж «Выгодно» + **7 дней бесплатно** (intro-offer)
- Безлимит сканов
- Все языки (без лимита пар)
- Умный тест без лимита
- «Вся сцена» — много слов за один кадр
- 2–3 примера + мнемоника «как запомнить»
- Экспорт коллекции

> **Про «офлайн»:** это НЕ платная фича. Коллекция и повторение работают офлайн у всех
> (карточки в локальном SQLite) — поэтому в паволле офлайн не обещаем.

> **iOS-цены:** на нативе цена/период берутся из App Store через RevenueCat
> (`planFromPackage`) — так требует Guideline 3.1.2. Статичные $6.99/$39.99 — запасной
> вид для web (Polar) и до настройки RevenueCat.

## Состояние в коде
Оплата **реализована** (не заглушки):
- iOS — RevenueCat, `src/lib/iap.ts` (+ вебхук `supabase/functions/revenuecat-webhook/`).
- Web — redirect в Polar, `src/lib/polar.ts`.
- Статус подписки — хук `useSubscription()` (таблица `subscriptions` + RevenueCat entitlement).
- Гейты фич — через `isPremium` из `useSubscription()` / `useCollection()`.

## Источники
- Polar — Merchant of Record: https://polar.sh/docs/merchant-of-record/introduction
- RevenueCat — iOS IAP: https://www.revenuecat.com/platform/ios-in-app-purchases
- Dodo — продажа цифровых товаров на iOS: https://docs.dodopayments.com/features/appstore-digital-goods
- Apple — авто-продляемые подписки: https://developer.apple.com/app-store/subscriptions/
- TechCrunch — внешние ссылки на оплату в US: https://techcrunch.com/2025/05/02/apple-changes-us-app-store-rules-to-let-apps-redirect-users-to-their-own-websites-for-payments/
