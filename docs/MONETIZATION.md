# CatchWord — монетизация: решение и план

> Обновлено: 2026-06-27. Тарифы — спека §8. Этот файл фиксирует, ЧЕМ
> принимать оплату и почему, плюс чек-лист запуска.

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
- [ ] Создать **Subscription Group** «CatchWord Premium».
- [ ] Продукты: Basic мес/год, Premium мес/год; цены/уровни/описания.
- [ ] **7-дневный триал** = intro-offer на продукте.
- [ ] **Lifetime $79.99** = отдельная non-consumable покупка.

**RevenueCat:**
- [ ] Проект + подключить App Store (app-specific shared secret).
- [ ] Завести **entitlement** `premium`, привязать продукты.
- [ ] SDK `react-native-purchases`, пейволл (можно Paywalls v2 no-code).
- [ ] Протестировать в **Sandbox**: покупка/восстановление/триал/отмена.

**App Review (особенно 4+/AI):**
- [ ] Раскрыть цену, период, **авто-продление**; кнопка **«Восстановить покупки»**.
- [ ] Ссылки на **Privacy Policy** и **Terms**.
- [ ] Не ставить категорию **«Kids»** (там жёстче) — у нас обычная «образование», возраст 4+.

## Тарифы (спека §8 — уже в коде пейволла)
- Free — $0 · 15 сканов всего · 1 язык · 1 пример.
- Basic — $4.99/мес · $24.99/год · 150 сканов/мес · 1–2 языка · + произношение.
- Premium — $9.99/мес · $39.99/год (годовой «Best Value») · безлимит · все языки · 2–3 примера + грамматика · офлайн/экспорт · 7-дн триал.
- Lifetime — $79.99 (опц.).

## План в коде (когда дойдём)
Сделать обёртку `useEntitlements()` (`premium: boolean` + триггеры пейволла), чтобы экраны не зависели от провайдера. Сейчас в пейволле кнопки — заглушки (Alert).

## Источники
- Polar — Merchant of Record: https://polar.sh/docs/merchant-of-record/introduction
- RevenueCat — iOS IAP: https://www.revenuecat.com/platform/ios-in-app-purchases
- Dodo — продажа цифровых товаров на iOS: https://docs.dodopayments.com/features/appstore-digital-goods
- Apple — авто-продляемые подписки: https://developer.apple.com/app-store/subscriptions/
- TechCrunch — внешние ссылки на оплату в US: https://techcrunch.com/2025/05/02/apple-changes-us-app-store-rules-to-let-apps-redirect-users-to-their-own-websites-for-payments/
