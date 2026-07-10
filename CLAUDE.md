# CatchWord / TakeWord

Учи язык камерой: наводишь на предмет — приложение узнаёт его и выдаёт карточку со словом.
Expo SDK 56 + expo-router, Supabase (auth + БД + edge functions), распознавание — Gemini 2.5 Flash,
оплата — Apple IAP через RevenueCat. Веб-версия собирается тем же кодом и живёт на Cloudflare Pages.

Подробности — в `docs/`: `SETUP.md`, `MONETIZATION.md`, `SETUP-recognition.md`, `DEPLOY-web.md`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /gstack-office-hours
- Strategy/scope → invoke /gstack-plan-ceo-review
- Architecture → invoke /gstack-plan-eng-review
- Design system/plan review → invoke /gstack-design-consultation or /gstack-plan-design-review
- Full review pipeline → invoke /gstack-autoplan
- Bugs/errors → invoke /gstack-investigate
- QA/testing site behavior → invoke /gstack-qa or /gstack-qa-only
- iOS QA on a real device → invoke /gstack-ios-qa
- iOS visual design audit → invoke /gstack-ios-design-review
- Code review/diff check → invoke /gstack-review
- Visual polish → invoke /gstack-design-review
- Ship/deploy/PR → invoke /gstack-ship or /gstack-land-and-deploy
- Save progress → invoke /gstack-context-save
- Resume context → invoke /gstack-context-restore
- Author a backlog-ready spec/issue → invoke /gstack-spec

gstack установлен с префиксом `gstack-`, поэтому встроенный `/review` не перекрыт.
