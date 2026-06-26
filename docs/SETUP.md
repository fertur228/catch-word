# CatchWord — окружение, запуск и грабли (важно!)

> Здесь записаны все затыки, через которые мы прошли, и их лечение —
> чтобы не наступать повторно. Среда: macOS Apple Silicon (M3), Xcode 26.5,
> Node 22, npm 10.

## Ключевые факты окружения
- **Проект:** `/Users/almazbukayev/CatchWord`
- **bundle id:** `com.almazbukayev.catchword`
- **Личная команда Apple (для разработки):** `KT9S62S5Y2` (Apple ID `bukaevalmaz2005@icloud.com`) — это **(Personal Team)**, бесплатная.
- **Инкубаторская команда:** `6F4RCY8SHH` (платная) — **НЕ использовать для повседневной разработки** (она для прод-публикации позже).
- **CocoaPods** установлен через **Homebrew** (`/opt/homebrew/bin/pod`, версия 1.16.2).
- В `~/.zprofile` добавлена строка `eval "$(/opt/homebrew/bin/brew shellenv)"` (brew/pod в PATH нового терминала).

## Запуск на симуляторе (просто, без подписи)
```bash
cd /Users/almazbukayev/CatchWord
npx expo run:ios            # первый раз: собирает и ставит на симулятор
# дальше каждый день:
npx expo start             # затем нажать i
```
> На симуляторе **камера чёрная** (камеры нет) — это норма; весь остальной поток работает.

## Запуск на реальном iPhone (нужна подпись — делается ОДИН раз в Xcode)
CLI (expo/xcodebuild) **не умеет** выписывать профиль для бесплатного аккаунта —
первую сборку на устройство нужно сделать кнопкой **Run в Xcode**:
1. На iPhone: **Настройки → Конфиденциальность → Режим разработчика** → вкл → перезагрузка.
2. Подключить кабелем, разблокировать, «**Доверять этому компьютеру**».
3. `open ios/CatchWord.xcworkspace`
4. В Xcode: target **CatchWord** → **Signing & Capabilities** → Team = **(Personal Team) KT9S62S5Y2**, «Automatically manage signing» вкл.
5. Сверху выбрать устройство **iPhone 14** → нажать **▶ Run**.
6. На телефоне один раз: **Настройки → Основные → VPN и управление устройством** → доверять разработчику.
7. После этого профиль создан; дальше можно `npx expo run:ios --device` или `npx expo start --dev-client`.
> Бесплатный аккаунт: приложение «живёт» 7 дней, потом пересобрать.

## Грабли, на которые мы наступили (и лечение)
1. **CocoaPods не ставился** — системный Ruby 2.6 слишком стар (`ffi`/`securerandom` требуют Ruby ≥3).
   → Лечение: поставить Homebrew, затем `brew install cocoapods` (приносит свой Ruby).
2. **Нет iOS-платформы в Xcode** (`iOS 26.5 is not installed`) — Xcode 26 ставится без неё.
   → Лечение: `xcodebuild -downloadPlatform iOS` (~8.5 ГБ, лучше на Wi-Fi). Нужна и для симулятора, и для устройства.
3. **Подпись: `No Account for Team KT9S62S5Y2`** при сборке из CLI.
   → Это норма: бесплатную команду подписывает только Xcode GUI. Сделать первую сборку через ▶ Run в Xcode (см. выше).
4. **Случайно выбралась инкубаторская команда** (`6F4RCY8SHH`) → профиль не сходился с сертификатом.
   → Всегда выбирать **(Personal Team)**. Сертификат у нас для `KT9S62S5Y2`.
5. **`No profiles for 'com.catchword.app'`** — старый bundle id конфликтовал.
   → Сменили на уникальный `com.almazbukayev.catchword`.
6. **`Sandbox: bash deny file-write-create … Pods/resources-to-copy`** — в шаблоне SDK 56 у app-таргета `ENABLE_USER_SCRIPT_SANDBOXING = YES`, ломает скрипты CocoaPods.
   → Поставить `NO` в `ios/CatchWord.xcodeproj/project.pbxproj`.

## ⚠️ ВАЖНО: папка `ios/` генерируется и НЕ в git
`ios/` (и `android/`) создаются командой `expo prebuild` и **не хранятся в репозитории** (`.gitignore`). Это значит: при `expo prebuild --clean` сбросятся правки, которые мы делали прямо в нативном проекте:
- `ENABLE_USER_SCRIPT_SANDBOXING = NO`
- `DEVELOPMENT_TEAM = KT9S62S5Y2`
- bundle id уже берётся из `app.json` ✅ (его не потеряем)

**Что с этим делать (TODO на будущее):** перенести эти настройки в `app.json` через `expo-build-properties` / конфиг-плагин, чтобы они применялись автоматически при каждом prebuild. Пока — после `prebuild --clean` поправить вручную.

## Проверка кода без запуска приложения
```bash
npx tsc --noEmit           # типы (0 ошибок = ок)
npx expo export -p ios     # полный бандл (ловит ошибки импортов; "iOS Bundled … modules" = ок)
```

## Остановить / перезапустить dev-сервер (Metro)
```bash
# остановить:  Ctrl+C в окне с сервером,  или
lsof -ti:8081 | xargs kill
# запустить:
npx expo start             # затем i (симулятор) / открыть приложение на телефоне
```
