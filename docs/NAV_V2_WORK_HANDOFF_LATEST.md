# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `0a127e4990a14b52d9d0ba040a84fe317af35365` — merge PR #309.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main` по последней проверке.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #309 frontend/tests-only: schema, grants, RPC, Auth, Edge Functions и рабочие строки не менялись.
- Открытых PR после merge #309: нет на момент обновления handoff.

## Завершённая продуктовая цепочка

### PR #288 — dashboard «Что делать сейчас»

- три объяснимых приоритета;
- role-aware действия;
- KPI без demo и точных повторов;
- шесть последних рабочих сделок.

### PR #290 — рабочие режимы списка сделок

- рабочий default без demo;
- точные повторы объединяются в канонический рабочий набор;
- role-aware быстрые режимы;
- исходные записи доступны через расширенный фильтр.

### PR #291 — action-first карточка

- один блок `Главное действие сейчас`;
- ответственный, срок и критерий результата;
- точный переход в задачи, риски, документы или сводку.

### PR #292 — прямые маршруты менеджера

- задачи → `#tasks`;
- риски → `#risks`;
- документы → `#docs`;
- пробелы ответственности → remediation workspace.

### PR #294 — единый цикл доработки СПН

Закрыт маршрут:

`замечание → где исправить → сохранить → повторно отправить → увидеть серверное подтверждение`

Используются существующие rework/status/comment RPC.

### PR #296 — документный цикл юриста

Закрыт маршрут:

`нужен → запрошен → получен → проверен / проблема`

Используется существующий document workflow RPC.

### PR #298 — подтверждение результата и следующий шаг

- audit event принимается только при совпадении с текущим состоянием;
- no-op, обратные, повторно открытые и старые события отбрасываются;
- после подтверждённого результата выбирается следующий шаг.

### PR #300 — менеджерский контроль подтверждённых результатов

- отдельно показаны открытый backlog и server-confirmed результаты;
- режимы `Сегодня` и `За 7 дней`;
- максимум 40 карточек и 4 параллельных read-запроса;
- manager workspace остаётся read-only.

### PR #302 — мобильный операционный первый экран

На 360–430 px:

- главное действие показывается до KPI и вторичных списков;
- дополнительный контекст раскрывается через progressive disclosure;
- desktop остаётся полностью раскрытым;
- page module budgets не увеличены.

### PR #306 — privacy-safe UX measurement contract

Browser runtime:

- только локальный `CustomEvent` `nav-v2:ux-measurement`;
- только enum-поля;
- нет UUID, URL, ФИО, адресов, комментариев или свободного текста;
- нет storage, network transport, RPC или collector;
- click не считается результатом.

Pure server model:

- определяет server-confirmed результат;
- считает диапазоны цикла возврата СПН;
- не подключён к transport или storage.

Запрещено без отдельного решения:

- telemetry backend;
- таблица событий;
- collector;
- retention policy;
- новый UX report;
- персональные рейтинги.

PR #307 закрыт без merge, поскольку предлагал более широкий session/report подход до утверждения measurement policy.

### PR #309 — keyboard/focus accessibility continuity

Добавлен общий focus-layer для dashboard, deals, deal card и manager workspace.

Что изменено:

- видимый `:focus-visible` outline не менее 3 px;
- forced-colors fallback;
- primary CTA получает проверяемое accessible name;
- `summary` получает `aria-expanded` и `aria-controls`;
- при закрытии disclosure с фокусом внутри скрываемого блока фокус возвращается на `summary`;
- клавиатурный переход во вкладку карточки переводит фокус на активный рабочий panel;
- прямые ссылки `#tasks`, `#docs`, `#risks` и другие получают точный focus target;
- активная вкладка получает `aria-pressed`;
- panel получает `tabindex=-1`, а положительный `tabindex` запрещён;
- pointer-навигация не получает принудительного focus jump;
- reduced-motion учитывается при прокрутке.

Архитектура:

- `assets/js/nav-v2/focus-continuity-model-v2.js` — pure model;
- `assets/js/nav-v2/focus-continuity-v2.js` — delegated DOM lifecycle;
- подключение через существующий `mobile-first-screen-v2.js`;
- entry-module budgets не выросли;
- mobile lifecycle cache-bust: `20260715-03`;
- mobile CSS cache-bust: `20260715-02`.

## Проверки PR #309

Финальный head: `1c2e69452281f4f21a2e796703edd3923b19dfe3`.

Успешно пройдены:

- keyboard focus semantic contract;
- keyboard focus static contract;
- JavaScript и Python syntax;
- dedicated Playwright desktop/mobile;
- visible focus ring;
- first logical Tab target;
- accessible name;
- mobile disclosure focus restore;
- desktop always-open disclosure state;
- focus target после смены вкладки;
- запрет положительного `tabindex`;
- privacy-safe UX semantic/static/browser contract;
- полный Navigator v2 static suite;
- mobile first screen;
- dashboard priority;
- deals work modes;
- action focus;
- SPN rework;
- lawyer document cycle;
- completion evidence;
- manager action routes;
- manager confirmed results;
- BAZA checks;
- общий public desktop/mobile smoke;
- review threads: 0.

Первый keyboard browser run выявил неверное desktop-ожидание теста: на широком экране details намеренно раскрыт, а summary скрыт. Runtime не ослаблялся; тест разделён на корректные mobile и desktop ожидания. Повторный desktop/mobile run — PASS.

Общий browser workflow имеет conclusion `success`, но его `authenticated-smoke` job был `skipped`. Это не authenticated matrix PASS.

## Supabase и рабочие данные

PR #306/#309 не выполняли Supabase read/write и не создавали новый live baseline.

Последний подтверждённый read-only baseline до этих frontend-срезов:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

Эти значения могут измениться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Ручные gates

Проверены ранее 15 июля. Не перепроверять после каждого frontend-среза без нового сигнала.

### Exact duplicate cleanup

- issue #273 открыта;
- owner decision не предоставлен;
- удаление, объединение и архивирование запрещено.

### Operational pilot

- шесть evidence-файлов не предоставлены;
- pilot mutation запрещена.

### Responsibility correction

- четыре evidence-файла не предоставлены;
- не менять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

### Production-readonly workflow

- ручной запуск `navigator-production-readonly` с `allow_drift=false` не предоставлен;
- source/browser smoke не подменяет workflow.

### Isolated authenticated E2E

- issue #282 без точного cost approval;
- generic-команда `продолжай` не является approval;
- не вызывать `confirm_cost`;
- не создавать branch, Auth users, secrets или synthetic target.

## Следующий безопасный продуктовый slice

P1 UX — доступная обратная связь после действий и ошибок.

Цель:

`действие → состояние выполнения → успех или ошибка → понятный следующий фокус → продолжение работы`

Требования:

1. Проверить основные mutation/status flows карточки и rework/document cycles.
2. Длительная операция должна иметь `role=status` и понятный busy-текст.
3. Ошибка должна иметь `role=alert`, сохранять введённые данные и переводить фокус на сообщение только при клавиатурном запуске.
4. После успешной server-confirmed перезагрузки фокус должен попадать на подтверждённый результат или следующий action block.
5. Не создавать бесконечные live-region announcements при повторном render.
6. Не менять role-aware permissions или mutation semantics.
7. Использовать существующие status containers и explicit lifecycle.
8. Добавить pure policy, static contract и synthetic desktop/mobile Playwright.
9. Не добавлять RPC, storage, collector или backend.

Measurement backend остаётся заблокирован до решения о:

- управленческом действии;
- denominator и дедупликации;
- минимальной выборке;
- retention;
- доступах;
- privacy review.

## NEXT_WORK_QUEUE

- P1 UX — accessible async status/error/success focus continuity.
- P1 UX — семантика landmarks/headings и screen-reader названия action-first блоков после async slice.
- P1 MANUAL MEASUREMENT — решение о collector/aggregation/retention/access policy.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot evidence-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- dashboard/list/deal-card/manager action-first;
- SPN rework;
- lawyer document lifecycle;
- completion evidence;
- manager confirmed results;
- mobile first screen;
- privacy-safe event schema/contract;
- keyboard/focus continuity PR #309;
- новый UX report, collector, storage или telemetry backend без отдельного решения;
- public guest/no-JWT/private-helper smoke;
- risk lifecycle #218;
- readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- responsibility/pilot scaffolding;
- duplicate comparison/trigger;
- isolated E2E cost scaffold;
- Edge observability и Advisor attestation.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #309. Один раз проверь, появились ли новые ручные evidence/approval. Если нет — не повторяй action-first, SPN rework, document cycle, completion evidence, manager results, mobile first-screen, privacy measurement и keyboard focus. Начни accessible async feedback slice: role=status/alert, busy/success/error announcements, сохранение контекста и точный focus target после server-confirmed результата. Используй существующие status containers и lifecycle, без новых RPC/storage/backend. Добавь semantic/static/public desktop-mobile regressions. Не меняй production data и не создавай платную Supabase branch без точного approval #282.`
