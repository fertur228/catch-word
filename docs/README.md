# CatchWord — документация

Рабочие заметки по проекту. Источник правды по продукту — [`../catchword_project_doc.md`](../catchword_project_doc.md).

- **[PROGRESS.md](./PROGRESS.md)** — текущее состояние, архитектура (где что лежит), что готово и дорожная карта по слоям.
- **[SETUP.md](./SETUP.md)** — окружение, команды запуска (симулятор/iPhone) и **все грабли + лечение** (CocoaPods/Homebrew, iOS-платформа, подпись, sandbox). Читать перед сборкой.
- **[MONETIZATION.md](./MONETIZATION.md)** — решение по оплате (RevenueCat vs Polar/Dodo) и чек-лист запуска подписок.

## Быстрый старт
```bash
cd /Users/almazbukayev/CatchWord
npx expo run:ios     # собрать и запустить на симуляторе (первый раз)
npx expo start       # дальше каждый день: затем нажать i
```

## Статус
- Стек: Expo SDK 56 + TypeScript + expo-router.
- Стадия: рабочий MVP уровня CapWords **на моках** (без бэкенда/оплаты/реального распознавания).
- Git: `b584a81` (скелет) → `995ff9c` (полировка + фичи).
