# CatchWord — дизайн-брифы для Google Stitch

> Как пользоваться: для каждого экрана скопируй текст из ``` блока в Google Stitch. Перед первым экраном можно один раз вставить «Общий стиль» ниже — чтобы все экраны были в одной дизайн-системе.

## 🎨 Общий стиль (вставить как контекст / в начало каждого промпта)

```
Design a cohesive iOS mobile app called "CatchWord" — a playful, premium language-learning app where you point your camera at real objects to collect foreign words like stickers in a scrapbook (vibe: CapWords meets Duolingo). 
Style: warm, tactile, gamified; SF Pro / rounded system font; large bold titles; soft low shadows; generous rounded corners (cards 16–24px, sticker tiles ~28% radius, pills fully rounded); spring micro-animations.
Light palette: background #FFFFFF, text #11181C, secondary text #5B6168, cards #FFFFFF (1px border #E3E5EA), element fill #F1F2F5. Primary indigo #4F46E5 (soft #EEF0FF). Signature coral accent #FF7A59 for "caught it!" highlights, sparkles, scan line (soft #FFE9E2). Teal #12B5A5 for stats/progress (soft #DCF7F3). Gold #C77C0A for streaks 🔥 and mastery stars. Green #1F9D55 for success. Provide a matching dark theme (bg #0B0B0F, cards #16171C).
Signature component: a "sticker" = rounded square (~28% radius) with a soft shadow holding either an object emoji or a real cut-out photo of the object on a transparent background.
```


## Онбординг / выбор языка
_Тёплое приветствие из 3 интро-слайдов и финального шага, где выбираешь язык, который учишь, и родной язык._

```
Design a premium, playful iOS onboarding screen (portrait) for a language-learning app, in the warm tactile sticker/scrapbook style of CapWords + Duolingo. This is a multi-step onboarding flow; show it as a reusable template with two key states: (A) an intro slide, and (B) the final language-selection step. Use SF Pro Rounded, large bold titles, soft low shadows, generous rounded corners.

GLOBAL LAYOUT (top to bottom, same on every step):
- Top bar (44px tall): on the LEFT a back chevron "‹" (hidden/blank on the very first slide); on the RIGHT a ghost text button "Пропустить" in secondary gray (hidden on the final language step).
- Center: a large flexible content zone that changes per step (described below).
- Bottom: a row of page-indicator dots — 4 dots, the active one stretched into a 22px-wide indigo pill (#4F46E5), the rest small 8px gray dots (#E3E5EA). Below the dots, a full-width big rounded primary button in indigo #4F46E5 with white text. Button label changes by step: "Далее" on slides 1–2, "Выбрать языки" on slide 3, and "Начать" with a sparkle ✨ icon on the language step.

STATE A — INTRO SLIDE (show slide 2 "catch" as the hero example):
Big friendly centered hero visual inside a 220x200 dashed-border rounded frame (border #4F46E5, dashed). Inside the frame a large "sticker" tile (rounded square ~28% radius, white card, soft shadow) holding a big apple emoji 🍎. Below/overlapping the frame, a coral pill badge (#FF7A59) with white text and a sparkle icon: "Поймал: apple". Under the hero, centered title (large bold, two lines) "Навёл →\nпоймал слово" and secondary gray subtitle "Наведи камеру на вещь — и поймай её слово, перевод и произношение." Other slides reuse this template: slide 1 hero is a big globe sticker 🌍 orbited by four small object stickers (🍎 ☕ 🌳 🚗), title "Весь мир —\nтвой словарь", subtitle "Любой предмет вокруг — это новое слово. Учись там, где живёшь."; slide 3 hero is a 2x2 grid of object stickers (🍎 ☕ 🐈 🚗) with a small white streak pill in the top-right showing a gold flame 🔥 and "5 дней", title "Копи\nи повторяй", subtitle "Слова копятся в коллекцию и вовремя всплывают на повторение."

STATE B — LANGUAGE SELECTION STEP (final step, the main deliverable):
Centered header: a large speaking-head sticker 🗣️ (rounded-square tile, soft shadow), bold title "Твои языки", secondary gray subtitle "Что учим и на каком языке показывать перевод."
Then two stacked rows, each with a small uppercase-ish secondary gray label above a horizontally scrollable strip of fully-rounded flag chips:
- Row 1 label "Я учу" — chips bleed to screen edges; selected chip is filled indigo #4F46E5 with white text, unselected chips are light fill #F1F2F5 with dark text #11181C and a 1px border #E3E5EA. Each chip = flag emoji + language name. Example chips in order: 🇺🇸 "English" (selected), 🇷🇺 "Русский", 🇪🇸 "Español", 🇫🇷 "Français", 🇩🇪 "Deutsch", 🇮🇹 "Italiano", 🇧🇷 "Português", 🇯🇵 "日本語", 🇰🇷 "한국어", 🇨🇳 "中文".
- Row 2 label "Мой язык" — same chip strip, with 🇷🇺 "Русский" selected (indigo).
Below the two rows, a summary card with soft indigo background (#EEF0FF), centered content, indigo text: 🇺🇸 "English"  →(arrow icon)  🇷🇺 "Русский".
On this step the bottom button reads "Начать" with a ✨ sparkle icon; show a loading variant of the button (spinner, label hidden) as an alternate state.

STYLE: light theme — background #FFFFFF, primary text #11181C, secondary text #5B6168; cards/stickers white with 1px #E3E5EA border and soft low shadow; element fill #F1F2F5. Primary indigo #4F46E5 / soft #EEF0FF; coral accent #FF7A59 / soft #FFE9E2 for the "caught" highlight; gold #C77C0A for the streak flame. Rounded-square sticker tiles (~28% radius), cards 16–24px radius, pills/chips fully rounded, soft springy tactile feel. Also provide a mirrored dark theme (background #0B0B0F, cards #16171C) keeping the same accent colors.
```

---

## Камера (главный экран)
_Живое превью камеры со сканирующим визиром: наводишь на предмет и ловишь слово._

```
Design an iOS mobile screen (portrait), a full-bleed CAMERA capture screen for a playful language-learning app. The entire background is a live camera preview (show a warm real-life scene, e.g. a wooden desk with a coffee mug and a plant). All UI floats on top of the video as a translucent overlay; overlay controls are white / semi-transparent glass so they stay readable on any image. Layout top-to-bottom:

TOP BAR (inside the safe area, left + right):
- Left: a fully-rounded translucent dark "glass" pill chip with a small lightning/bolt icon and white text "12/15 сканов".
- Right: a 40px round translucent dark button with a white settings gear icon.

DAILY-QUEST BANNER (directly under the top bar, full width): a rounded 20px translucent dark "glass" card, one row. Left: a 38px soft circular badge holding an object emoji "🧦". Middle (stacked): a tiny uppercase white-70% label "КВЕСТ ДНЯ" above a bold white single line "Найди и поймай: носок · der Socken". Right: a small fully-rounded pill with a gold flame icon "🔥" and bold white number "5" (streak). Also show, as an alternate state, a green-tinted version of this banner with a white checkmark badge, label "КВЕСТ ВЫПОЛНЕН" and title "Отличная работа! 🎉".

CENTER — SCANNING VIEWFINDER: a large ~264px rounded square (≈18px corner radius) centered. It is a faint translucent white "glass" panel with a thin 1.5px white-28% full border, plus four bright bold thick white L-shaped corner brackets (one in each corner). A glowing horizontal CORAL (#FF7A59) scan line with a soft coral glow sweeps vertically inside the frame. The frame has a gentle pulsing/breathing feel. Just below the frame, centered, a fully-rounded translucent dark hint pill with a viewfinder icon and white text "Наведи на предмет".

BOTTOM:
- A small centered translucent dark caption pill with low-opacity white text "На симуляторе превью чёрное — это нормально".
- The big SHUTTER button, centered: an 80px white ring (5px stroke, faint translucent white fill) containing a solid 60px white inner circle, surrounded by a soft expanding coral "breathing" ring that radiates outward and fades.

STATES:
- Default (granted): everything above over a live, slightly blurred-depth camera scene.
- Capture flash: a brief full-screen white flash when the shutter is pressed (the "caught it!" moment).
- Permission / empty state (separate variant, NO camera — solid app background on light tokens, centered column): a large rounded-square "sticker" tile with soft shadow holding a "📸" emoji; bold title "Включи камеру"; secondary grey paragraph "CatchWord наводится на предметы вокруг и превращает их в слова. Для этого нужен доступ к камере."; a big full-width rounded indigo primary button with camera icon "Разрешить камеру".

STYLE: iOS, SF Pro rounded font, large bold titles, soft low shadows, generous rounded corners, sticker/scrapbook feel. Palette: white #FFFFFF backgrounds and #11181C text on the permission screen; coral accent #FF7A59 for the scan line and breathing ring; indigo #4F46E5 for primary button; gold #C77C0A for the streak flame; green #1F9D55 for the completed-quest banner. Overlay chips and banner use translucent dark "glass" with white text. Playful, premium, warm, tactile, gamified. Provide a dark-theme variant of the permission screen too (bg #0B0B0F, cards #16171C).
```

---

## Распознаю… (обработка кадра)
_Короткая анимация-предвкушение: приложение «обрабатывает» снятый кадр перед тем, как показать пойманное слово._

```
Design a full-screen iOS mobile "recognizing / processing" overlay screen (portrait), shown right after the user taps the shutter — a satisfying anticipation pause before the "caught it!" reveal. No status bar chrome, no top nav, no tab bar — this is an immersive transient overlay on top of the live photo.

LAYOUT (bottom-to-top is irrelevant — it's centered):
- BACKGROUND: the user's just-captured real photo fills the entire screen (edge to edge), e.g. a close-up of a wooden chair / a coffee mug on a table, slightly zoomed in (subtle Ken Burns scale). Over it lay a soft dark "frosty" dimming scrim so the foreground UI pops.
- A thin glowing horizontal CORAL "#FF7A59" SCAN BEAM line spanning the full width of the screen, with a soft coral glow/blur, positioned mid-screen (animated state: it sweeps top-to-bottom).
- CENTERED VIEWFINDER FRAME: a 240px rounded square (radius ~16–24px) with a faint translucent white border "rgba(255,255,255,0.25)" and four bold CORAL "#FF7A59" L-shaped corner brackets (one at each corner, ~30px, rounded), giving an AR camera-targeting look.
- INSIDE the frame, dead center: a pulsing focus reticle — a spinning ring (~84px, translucent white track with a coral "#FF7A59" top arc, like a loading spinner) wrapping a small centered coral viewfinder/target icon. The reticle gently "breathes" (scales 0.86→1.06) while the ring rotates.
- BELOW the frame, centered: small bold white caption text "Распознаю предмет…" followed by a row of three small pulsing coral "#FF7A59" dots animating in sequence (thinking indicator).

CONTENT/COPY:
- Caption: "Распознаю предмет…" (white text on the photo).
- The three animated dots act as the "…" thinking ellipsis.

STATES:
- LOADING (default, this whole screen): photo visible + dark scrim + sweeping coral beam + spinning breathing reticle + pulsing dots. The screen is non-interactive (taps are blocked, no buttons) and cannot be swiped away — it's a ~1s automatic transition.
- FALLBACK (no captured photo, e.g. simulator): instead of the real photo, show a clean frosty white "#FFFFFF" dimmed scrim; the same coral viewfinder frame, spinner reticle and "Распознаю предмет…" caption, but the scan line stays a short coral bar contained inside the 240px frame (not full-width).

STYLE: Premium, playful, tactile language-learning app (CapWords × Duolingo energy). iOS, SF Pro rounded font, large clear hierarchy. Signature warm CORAL accent "#FF7A59" for the scan beam, corner brackets, spinner arc, reticle icon and dots. Soft glows, soft shadows, fully rounded dots, rounded viewfinder corners. Calm, satisfying, anticipatory mood. Provide both a LIGHT (real photo, dark scrim) and DARK (bg "#0B0B0F") variant — the dark theme mirrors the same coral-on-dim layout.
```

---

## Результат — «Поймал слово»
_Экран награды после распознавания: стикер пойманного предмета, слово, транскрипция, перевод и кнопки сохранить/переснять._

```
Design an iOS mobile screen (portrait), shown as a modal sheet — the "reward" moment of a camera language-learning app right after an object is recognized. Light theme primary; also provide a dark variant. Vertically centered content with generous spacing, scrollable.

TOP TO BOTTOM:
1. A small centered pill badge with a coral sparkle icon and bold coral text "Поймал!" on a soft-coral fill (#FFE9E2, text #FF7A59). This is the signature "caught it!" highlight.
2. THE HERO STICKER: a large (~160px) rounded-square sticker (≈28% corner radius) with a soft low shadow and subtle tilt, holding a real cut-out photo of the object on a transparent background (example: a yellow lemon) — fall back to a big object emoji 🍋 if no photo. The sticker looks like a collectible scrapbook sticker that just "popped" in with a spring animation.
3. The recognized word, very large and bold (~42px), centered: "Lemon". To its right a small round pencil button on a light grey fill (#F1F2F5) inviting the user to tap/edit the word.
4. A pronunciation row, centered: the IPA transcription in secondary grey "/ˈlem.ən/", followed by TWO round buttons side by side — a primary speaker button "🔊" and a second turtle "🐢" slow-pronunciation button (both ~44px, soft indigo fill #EEF0FF, indigo icon #4F46E5).
5. The native translation, large and semi-bold (~22px), centered: "лимон", with a small teal "авто" sparkle badge pill next to it (soft teal #DCF7F3, text #12B5A5) indicating the translation was auto-filled from the dictionary.
6. A centered category chip (fully rounded pill, selected/filled state) with a tag icon and label "Еда".
7. An example card: white rounded card (radius ~20px, 1px border #E3E5EA, soft shadow) with a small header row — a teal speech-bubble icon and bold grey label "Пример" — and below one example sentence: "I bought a fresh lemon at the market.".

BOTTOM ACTION STACK:
- A big full-width primary indigo button (#4F46E5, white text) with a checkmark icon: "Сохранить".
- Below it a row of two equal buttons: a secondary button with a circular-arrow icon "Переснять", and a ghost (text-only) button with an x icon "Отмена".

STATES TO SHOW:
- Saved state: a green circular success "stamp" badge with a white checkmark overlapping the top-right corner of the sticker, and the primary button label changed to "Сохранено!". Optionally a centered soft-coral congratulation pill above everything: "Квест дня выполнен! 🎯".
- Edit state (inline editor variant): replace the word/translation block with a white rounded card titled with a pencil icon and "Измени слово", containing three labeled input fields stacked: a bold word input (placeholder "Слово на английском") with a clear-x icon, a "Перевод" field (placeholder "Перевод на русский"), and a "Транскрипция" field (placeholder "напр. ˈlem.ən"); under the word field a dropdown suggestions list where each row shows a dictionary word on the left and its grey Russian translation on the right; a soft-gold info hint pill reading "Авто-перевод появится с бэкендом — впиши сам или выбери из подсказок"; and two buttons at the bottom: primary "Готово" (checkmark) and ghost "Отмена".

STYLE: playful, premium, warm, tactile, gamified scrapbook feel. SF Pro Rounded, large bold titles, clear hierarchy. White background #FFFFFF, primary text #11181C, secondary #5B6168, element fill #F1F2F5. Indigo primary #4F46E5 / soft #EEF0FF, coral accent #FF7A59 / soft #FFE9E2, teal #12B5A5 / soft #DCF7F3, gold #C77C0A, success green #1F9D55. Rounded corners (cards 16–24px, sticker ~28%, chips fully rounded), soft low shadows, spring micro-animation energy. Dark theme mirrors it (bg #0B0B0F, cards #16171C).
```

---

## Коллекция / скрапбук
_Витрина пойманных слов: статистика, поиск, категории и сетка стикеров-карточек._

```
Design an iOS mobile screen (portrait), the "scrapbook collection" of a playful language-learning app — words collected like stickers. SF Pro Rounded font, large bold titles, soft shadows, rounded corners, warm tactile premium feel (CapWords × Duolingo). Vertical scroll. Provide both a light and a dark theme.

TOP — large screen title "Коллекция", bold, left-aligned.

HEADER BLOCK (scrolls with content):
1) A row of 3 equal stat cards (white card, 1px #E3E5EA border, soft low shadow, ~20px radius), each = small round tinted icon + big bold number + small grey label:
   - sparkles icon in soft coral #FFE9E2 / coral #FF7A59 — number "128" — label "Поймано"
   - graduation-cap icon in soft green / green #1F9D55 — number "54" — label "Выучено"
   - flame 🔥 icon in soft gold / gold #C77C0A — number "12" — label "Серия"
2) A "mastery" progress card (white, bordered, ~20px radius): top row with bold small title "Освоение" on the left and grey counter "54 / 128" on the right; below a rounded green #1F9D55 progress bar filled ~42%.
3) A rounded search field (light fill #F1F2F5, magnifier icon) with placeholder "Поиск слова или перевода".
4) A horizontally-scrolling row of fully-rounded category chips; the first chip "Все" is selected (indigo #4F46E5 fill, white text), the rest are unselected (light #F1F2F5 fill, dark text): "Еда", "Напитки", "Мебель", "Дом", "Природа", "Животные", "Транспорт".
5) A segmented control (pill, light track, white selected segment) with two options: "Сетка" (selected) and "По датам".
6) A small section header row: a grid icon + bold title "Мои слова" on the left, grey subtitle "128 слов" on the right.

MAIN — a 2-column grid of "sticker" word tiles. Each tile is a white card (1px #E3E5EA border, soft shadow, ~20px radius, centered content): on top a large "sticker" = a rounded-square (~28% corner radius) with its own soft shadow holding the object — some stickers show a bright object emoji, others show a real cut-out photo of the object on a transparent background; below it the foreign word in bold #11181C, and under it the native translation in grey #5B6168.
Example tiles: 🍎 "apple" / "яблоко"; ☕ "coffee" / "кофе"; 🐕 "dog" / "собака"; 📖 "book" / "книга"; cut-out photo of a chair "chair" / "стул"; cut-out photo of a backpack "backpack" / "рюкзак"; 🌸 "flower" / "цветок"; ✈️ "airplane" / "самолёт"; 📱 "phone" / "телефон"; 🦋 "butterfly" / "бабочка". Fill the visible area with ~8–10 tiles in two even columns.

INTERACTIONS / STATES:
- Tiles have a subtle pressed (slightly dimmed) state; long-pressing a tile reveals a delete confirmation alert titled "Удалить слово?" with body "«apple» исчезнет из коллекции." and buttons "Отмена" and a red destructive "Удалить".
- Empty-search state (show as a small alt panel): a magnifier illustration, bold title "Ничего не нашлось", grey message "Попробуй другой запрос или категорию.", and a rounded secondary button "Сбросить фильтры".
- First-run empty state (alt panel): a sparkles illustration, bold title "Коллекция пуста", grey message "Наведи камеру на предмет и поймай своё первое слово.", and a big rounded indigo primary button "Открыть камеру".

STYLE: background #FFFFFF (dark #0B0B0F), cards #FFFFFF (dark #16171C), primary text #11181C, secondary #5B6168; indigo #4F46E5 for primary/selection, coral #FF7A59 signature accent, teal #12B5A5, gold #C77C0A, green #1F9D55. Card radii 16–24px, sticker tiles ~28% rounded, chips/segments fully rounded; soft low shadows; clear hierarchy, generous spacing, gamified scrapbook feel.
```

---

## Карточка слова
_Подробная карточка одного пойманного слова: большой стикер, произношение, освоение, примеры и действия._

```
Design an iOS mobile screen (portrait), a scrollable detail view called "Word Card" for a playful, premium language-learning app. SF Pro rounded font, large bold titles, soft low shadows, generous rounded corners, a sticker/scrapbook feel. Layout top to bottom:

1) HERO BLOCK: a wide rounded card (radius ~24px) filled with soft warm coral #FFE9E2, centered. Inside it sits one big "sticker": a rounded square (~28% corner radius) with a soft drop shadow on a white/transparent base, holding either a large object emoji OR a real cut-out photo of the object with a transparent background. Example: a red apple. The sticker looks like it just gently bounced/popped into place.

2) WORD ROW: on the left, a very large bold title word in the language being learned, e.g. "Apple" (font ~40px, color #11181C), and directly under it the IPA transcription in secondary grey #5B6168, e.g. "/ˈæp.əl/". On the right of the same row, two round pronunciation buttons side by side: a larger round 🔊 speaker button (~52px, soft indigo fill #EEF0FF with indigo #4F46E5 icon) and next to it a slightly smaller round 🐢 turtle "slow pronunciation" button (~44px, same soft indigo style).

3) META BLOCK: the native translation as a bold subtitle, e.g. "Яблоко" (#11181C). Below it a row containing a fully-rounded pill chip with a small grid icon and category label, e.g. "Еда", followed by small secondary-grey caught-time text, e.g. "Поймано сегодня".

4) MASTERY PANEL: a white card with 1px border #E3E5EA and soft shadow, radius ~16px. Header row: small bold grey label "Освоение" on the left, and on the right a rounded badge reading "В процессе" (teal/accent tone) — other possible states "Новое слово" (neutral grey) or "Освоено" (green #1F9D55). Below: a row of 5 stars, the first 3 filled gold #C77C0A and the last 2 empty/outline grey. Under the stars a thin rounded gold progress bar filled ~60%. Under that a small row with a clock icon + secondary-grey text "Повтор через 2 часа".

5) EXAMPLES SECTION: a section header with a speech-bubble icon, bold title "Примеры", and a small grey subtitle count "3 примера". Then a vertical list of example rows; each row is a soft light-grey fill #F1F2F5 rounded box (radius ~12px) containing an example sentence in the learned language on the left, e.g. "I ate an apple.", and a small round 🔊 speaker button (~38px, soft indigo) on the right.

6) OPTIONAL NOTE PANEL: a white bordered card like the mastery panel, header with a note icon + small bold grey label "Заметка", and body text with the user's personal note.

7) ACTIONS at the bottom: a big full-width primary rounded button in indigo #4F46E5 with a graduation-cap icon, text "Повторить сейчас"; below it a full-width ghost/transparent button with a trash icon and grey text "Удалить".

Also show the EMPTY/NOT-FOUND state variant: a centered friendly empty state with a magnifying-glass icon, bold title "Карточка не найдена", grey message "Возможно, её удалили из коллекции.", and a single rounded button "Назад".

Style: background #FFFFFF, primary text #11181C, secondary #5B6168, cards white with border #E3E5EA and soft shadow, element fill #F1F2F5; primary indigo #4F46E5 / soft #EEF0FF; coral accent #FF7A59 / soft #FFE9E2; teal #12B5A5 / soft #DCF7F3; gold #C77C0A; success green #1F9D55. Rounded, tactile, warm, gamified. Provide a matching dark variant with background #0B0B0F and cards #16171C.
```

---

## Повторение (флеш-карточки и тест)
_Экран сессии интервального повторения: выбор режима, переворот карточек с оценкой и тест с вариантами ответов._

```
Design an iOS mobile screen (portrait) for a playful, premium language-learning app — a spaced-repetition review session. SF Pro rounded font, large bold titles. Show the screen in its main FLASHCARD state, plus small thumbnails of the other states (intro, test, summary, empty) described below. Provide both light and dark themes.

MAIN STATE — flashcard review, layout top to bottom:
1. Optional "practice" info banner (pill-rounded strip, soft teal fill #DCF7F3, teal text #12B5A5, small sparkles icon): "На сегодня всё выучено — тренируемся".
2. Progress header row: left small bold gray label "Карточка 3 из 12"; right a fully-rounded indigo pill "25%". Below it a thin rounded progress bar filled ~25% in indigo #4F46E5 on light track #F1F2F5.
3. Centered hero "flash card": a large white rounded card (24px radius, soft low shadow, 1px border #E3E5EA), ~360px tall. Show its REVEALED (back) face: at top a big object word "Apfel" in large bold title, and immediately to its right TWO round soft-shadowed pronunciation buttons side by side — a speaker "🔊" button and a turtle "🐢" slow-pronunciation button (both circular, ~48px, light fill). Under the word a gray IPA line "/ˈʔapfl̩/". Below it the native translation "Яблоко" as a bold subtitle. At the bottom a soft example chip (rounded #F1F2F5 fill) with one sentence: "Der Apfel ist rot." (The card's FRONT/unrevealed face, shown as a smaller variant: a centered "sticker" — a rounded-square tile (~28% corner radius, soft shadow) holding either a big object emoji 🍎 OR a real cut-out photo of the object on transparent background — with text "Вспомни слово" and small gray hint "Нажми, чтобы показать".)
4. Bottom action area, two variants:
   - Before reveal: one big full-width rounded indigo primary button "Показать слово" with a sparkles icon.
   - After reveal (shown here): a row of THREE equal soft rating buttons, each a rounded block with icon, bold label and a tiny faded interval below it: red-coral block "Забыл" / "10 мин", indigo block "Вспомнил" / "1 ч", green block "Легко" / "4 д".

OTHER STATES (small thumbnails / alternates):
- INTRO (mode picker): centered sticker tile with "🧠", bold title "Повторение", gray subtitle "Готово к повторению: 12 слов." Two stacked selectable mode cards (white rounded cards with leading round icon, title, subtitle, trailing radio circle; selected card has indigo 2px border, soft indigo fill #EEF0FF and a filled check): "Флеш-карточки" / "Переворачивай и вспоминай" (selected) and "Тест" / "Выбери правильный ответ". Bottom full-width indigo button "Начать" with play icon.
- TEST: progress header "Вопрос 2 из 8" + indigo pill "13%" + progress bar. A tall white prompt card with a small pill tag in soft indigo "Как переводится?" and a large centered word "Hund" with a "🔊" speak button (or a sticker tile for picture questions). Below, four stacked rounded answer option buttons (white, 1px border, 56px tall): "Собака", "Кошка", "Лошадь", "Птица". Answered state: correct option turns soft-green with a check "✓" icon, the wrongly-tapped one turns soft-coral/red with an "✗", the rest dim to 50%. Bottom button "Дальше" (or "Завершить" on last) with arrow icon.
- SUMMARY: centered sticker "🎉", bold "Готово!", gray "Верно 6 из 8. Так держать!". A row of two stat cards (icon + big number + label): green "6/8" "Верно" and gold flame "🔥" streak "Серия дней". Two stacked buttons: indigo "В коллекцию" (grid icon) and ghost "К камере" (camera icon).
- EMPTY: centered camera icon, bold "Пока нечего повторять", gray "Поймай несколько слов камерой — и они появятся здесь на повторение.", indigo button "Открыть камеру".
- LOADING: centered spinner with gray text "Готовим повторение…".

Style: warm, tactile, gamified, scrapbook/sticker feel. Background #FFFFFF, primary text #11181C, secondary text #5B6168. Indigo #4F46E5 (primary, soft #EEF0FF), coral accent #FF7A59 (soft #FFE9E2), teal #12B5A5 (soft #DCF7F3), gold #C77C0A, success green #1F9D55. Cards 16–24px radius, sticker tiles ~28% rounded, chips/pills fully rounded, soft low shadows, generous spacing. Dark theme: bg #0B0B0F, cards #16171C, same accent hues.
```

---

## Пейволл (тарифы)
_Экран подписки: герой, переключатель «Месяц/Год», карточки тарифов Free/Basic/Premium, Lifetime и честное напоминание._

```
Design a single iOS mobile screen (portrait), a vertically scrolling subscription paywall for a playful, premium language-learning app. Rounded SF Pro typeface, large bold titles, soft low shadows, rounded corners, sticker/scrapbook feel.

LAYOUT, top to bottom:

1) HERO BLOCK, centered:
   - A large "sticker" tile: a rounded square (~28% corner radius) with soft shadow and a subtle white/indigo fill, holding a big rocket emoji "🚀".
   - Big bold centered title "Учи быстрее с Premium".
   - Secondary centered subtitle "Весь мир — твой словарь. Больше сканов, все языки и живые примеры.".
   - A row of two fully-rounded pill chips, centered, wrapping: an indigo-tinted pill with a gift icon labeled "7 дней бесплатно", and a neutral gray pill with a checkmark labeled "Без скрытых списаний".

2) BILLING TOGGLE:
   - A segmented control (pill-shaped track, fill #F1F2F5) with two options: "Месяц" and "Год — выгоднее". The second option "Год — выгоднее" is SELECTED, shown by a white rounded pill highlight with soft shadow sliding over it.
   - Small centered secondary caption below: "Год дешевле почти 5 месяцев помесячной оплаты.".

3) SECTION HEADER: a small sparkles icon + bold label "Сравнение тарифов".

4) THREE PLAN CARDS stacked vertically (16–24px radius, soft shadow). Each card: plan name (subtitle), big bold price, small secondary price-note, then a list of feature rows (each a green checkmark-circle icon + small text), and a big rounded full-width button at the bottom.

   - Card 1 "Free": price "$0", note "Бесплатно навсегда". Features: "15 сканов всего (или 3/день, 5 дней)", "1 язык", "Хорошая выдача, 1 пример", "Коллекция и просмотр — бесплатно". Secondary (ghost/gray) button "Текущий тариф".

   - Card 2 "Basic": price "$24.99 / год", note "Экономия ~58% против помесячной". Features: "150 сканов в месяц (хард-кап)", "1–2 языка", "+ произношение", "1 пример на слово". Secondary button "Выбрать Basic".

   - Card 3 "Premium" — HIGHLIGHTED: soft indigo fill (#EEF0FF) with a 2px indigo (#4F46E5) border. A gold (#C77C0A) fully-rounded badge "Best Value" pinned to the top-right corner. Price "$39.99 / год", note "Лучшая цена · 7 дней бесплатно". Features: "Безлимит сканов (мягкий лимит ~1000/мес)", "Все языки", "Топ-модель: 2–3 примера + грамматика", "Офлайн и экспорт", "7-дневный триал с честным напоминанием". A large solid indigo PRIMARY button "Начать 7 дней бесплатно".

5) LIFETIME STRIP: a card with soft gold fill (#FFF6E6 / goldSoft) and gold border. Left: an infinity icon in gold; titles "Lifetime · $79.99" (bold) and secondary "Один раз — Premium навсегда, без подписки". Below, a full-width secondary button with a star icon: "Купить навсегда".

6) HONEST NOTE: a teal-tinted rounded card (soft teal #DCF7F3) with a bell icon (#12B5A5) and small text: "Честно: напомним за 24 часа до конца бесплатного периода. Отменить можно в любой момент — без скрытых списаний.".

7) FOOTER, centered: an underlined indigo link "Восстановить покупки", then small gray legal text "Подписка продлевается автоматически, пока её не отменить в настройках Apple ID. Цены указаны для App Store (US)."

STATES: default shows "Год — выгоднее" selected with yearly prices and the "Best Value" badge on Premium. Alternate state: when "Месяц" is selected, Basic shows "$4.99 / мес" note "Якорный тариф", Premium shows "$9.99 / мес" note "7 дней бесплатно, потом $9.99/мес", Premium button "Попробовать Premium", and no badge; the toggle caption becomes "Перейти на годовую можно в любой момент.".

STYLE: light background #FFFFFF, primary text #11181C, secondary text #5B6168; cards #FFFFFF with 1px #E3E5EA border and soft shadow; fills #F1F2F5; primary indigo #4F46E5 with soft #EEF0FF; teal #12B5A5 / soft #DCF7F3; gold #C77C0A; success green #1F9D55. Also provide a dark theme (bg #0B0B0F, cards #16171C) mirroring the same hierarchy. Warm, tactile, premium, gamified feel with spring-like micro-animations on the segmented control and cards.
```

---

## Настройки
_Экран профиля и настроек: языковая пара, выбор голоса/акцента, подписка и сведения о приложении._

```
Design an iOS mobile settings screen (portrait) for a playful, premium language-learning app, in the warm scrapbook style of CapWords + Duolingo. White background, vertically scrolling, grouped iOS-style cards with 1px border #E3E5EA and soft low shadows, rounded corners. SF Pro rounded font.

Top to bottom:

1) HERO PROFILE CARD (rounded 20px, white, 1px border, soft shadow): on the left a 52px rounded-square avatar tile with soft indigo fill #EEF0FF holding an indigo #4F46E5 graduation-cap icon. To its right, two stacked lines: bold title "Учу Английский 🇬🇧" and below it secondary gray text "Родной — Русский 🇷🇺". On the far right a small fully-rounded gold pill tag "Free" (gold text #C77C0A on soft gold fill).

2) Section header (tiny gray uppercase, letter-spaced) "ЯЗЫК". Below it a grouped white card with two rows separated by a hairline divider. Each row: a 32px rounded-square colored icon tile on the left, bold label, gray value text on the right, and a small ">" chevron. Row 1: indigo globe icon, label "Изучаю", value "Английский 🇬🇧". Row 2: soft-coral icon tile #FFE9E2 with coral #FF7A59 speech-bubble icon, label "Родной", value "Русский 🇷🇉".

3) Section header "ГОЛОС / АКЦЕНТ". Grouped white card of voice rows. Row 1 (selected state): indigo speaker-wave icon tile, bold label "Системный голос", small gray sublabel "По умолчанию", and on the right a small gray play ▶ icon plus an indigo checkmark ✓. Row 2 and 3 (unselected): teal #12B5A5 waveform icon on soft teal tile #DCF7F3, label like "Samantha", small gray sublabel "en-US · Enhanced", right side a faint gray play ▶ icon only. Below the card, small gray hint text "Нажми голос, чтобы услышать пример."

4) Section header "ПОДПИСКА". A bright solid indigo #4F46E5 upsell banner card (rounded 16px): left a 40px rounded tile holding a white sparkles ✨ icon, then white bold title "CatchWord Premium" and white 85%-opacity subtitle "Безлимит сканов · все языки · офлайн", and a white ">" chevron on the right. Below it a grouped white card with two rows: Row 1 gold star icon, label "Текущий тариф", right side a small rounded gold pill "Free". Row 2 gray refresh icon, label "Восстановить покупки", with ">" chevron.

5) Section header "О ПРИЛОЖЕНИИ". Grouped white card, three rows with neutral gray icon tiles: "Политика конфиденциальности" (lock icon, chevron), "Условия использования" (document icon, chevron), "Версия" (info icon, gray value "1.0.0", no chevron).

6) Centered footer: bold gray slogan "See it. Catch it. Speak it." and below smaller gray line "CatchWord · сделано с ♥ в Казахстане".

Also show the LANGUAGE PICKER state: a bottom sheet modal sliding up over a dimmed backdrop, rounded top corners 28px, a small gray grabber handle at top, bold title "Язык изучения", and a scrolling list of language rows each with a large flag emoji + bold language name (e.g. "🇬🇧 Английский", "🇪🇸 Испанский", "🇫🇷 Французский", "🇩🇪 Немецкий", "🇮🇹 Итальянский"); the currently active row has a soft indigo #EEF0FF highlight fill and an indigo checkmark on the right.

Style: warm, tactile, premium, gamified; rounded-square colored icon tiles, fully-rounded pill chips, soft shadows, spring-pressed feel. Palette — background #FFFFFF, text #11181C, secondary #5B6168, primary indigo #4F46E5 / soft #EEF0FF, coral #FF7A59 / soft #FFE9E2, teal #12B5A5 / soft #DCF7F3, gold #C77C0A, success green #1F9D55. Provide a dark theme variant too (background #0B0B0F, cards #16171C, same accent hues).
```
