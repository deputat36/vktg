# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `aa83c46e4cf67fb3f2000f18dfa6499f892483b0` — merge PR #313.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main` по последней проверке.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #313 frontend/tests-only: schema, grants, RPC, Auth, Edge Functions и рабочие строки не менялись.
- Открытых PR после merge #313: нет на момент подготовки handoff.

## Завершённая продуктовая цепочка

### PR #288–#292 — action-first основа

- dashboard показывает три объяснимых приоритета;
- список сделок имеет role-aware рабочие режимы без demo и точных повторов;
- карточка показывает одно главное действие, ответственного, срок и критерий результата;
- менеджерские кнопки ведут сразу в задачи, риски, документы или remediation workspace.

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

- отдельно показаны backlog и server-confirmed результаты;
- режимы `Сегодня` и `За 7 дней`;
- максимум 40 карточек и 4 параллельных read-запроса;
- manager workspace остаётся read-only.

### PR #302 — мобильный операционный первый экран

На 360–430 px главное действие показывается до KPI и вторичных списков. Дополнительный контекст доступен через progressive disclosure. Desktop остаётся раскрытым.

### PR #306 — privacy-safe UX measurement contract

- только локальный enum-only `CustomEvent`;
- нет UUID, URL, ФИО, адресов, комментариев и свободного текста;
- нет storage, network transport, RPC или collector;
- click не считается подтверждённым результатом;
- pure server model определяет кандидаты server-confirmed результатов и диапазоны rework cycle;
- PR #307 с более широким session/report подходом закрыт без merge.

### PR #309 — keyboard/focus continuity

- контрастный `:focus-visible` outline и forced-colors fallback;
- primary CTA получает accessible name;
- disclosure получает `aria-expanded` и `aria-controls`;
- при закрытии disclosure фокус возвращается на summary;
- keyboard-переход во вкладку фокусирует рабочий panel;
- прямые `#tasks/#docs/#risks` получают точный focus target;
- pointer-навигация не получает принудительный focus jump;
- reduced-motion учитывается.

### PR #313 — accessible async feedback

Закрыт маршрут:

`действие → busy → success/error → server-confirmed reload → понятный следующий фокус`

Охвачены:

- повторная отправка СПН;
- возврат СПН на доработку;
- изменение состояния документа юристом.

Поведение:

- длительная операция: `role=status`, `aria-live=polite`, `aria-busy=true`;
- ошибка: `role=alert`, `aria-live=assertive`;
- при keyboard-запуске фокус переводится на ошибку;
- при pointer-запуске принудительного focus jump нет;
- активное поле ввода не теряет фокус и введённые данные не очищаются;
- повторные одинаковые announcements подавляются;
- watcher ограничен таймаутом и не использует `MutationObserver`;
- success публикует только разрешённый enum `nav_focus`;
- после reload фокус попадает на подтверждённый rework/document result либо следующий action block;
- служебный query-параметр удаляется из URL сразу после применения.

Архитектура:

- `assets/js/nav-v2/async-feedback-model-v2.js` — pure policy;
- `assets/js/nav-v2/async-feedback-v2.js` — delegated bounded runtime;
- интеграция через `deal-card-recheck-alert-v2.js`;
- active cache remap: `deal-card-recheck-alert-v2.js?v=20260715-02` → `20260715-16`;
- legacy mapping `20260711-02` → `20260715-15` сохранён для совместимых контрактов;
- новых entry modules, RPC, storage, collector и backend нет.

## Проверки PR #313

Финальный head: `ecd6f2500f94260d277b1b4210162a9aaeb6d5f9`.

PASS:

- async feedback semantic contract;
- async feedback static/privacy contract;
- JavaScript и Python syntax;
- synthetic Playwright desktop/mobile;
- keyboard busy/error/success;
- pointer error без focus jump;
- сохранение textarea;
- enum-only success token;
- post-reload focus и URL cleanup;
- полный Navigator v2 static suite;
- SPN rework cycle;
- lawyer document cycle;
- completion evidence;
- action focus;
- keyboard focus continuity;
- mobile first screen;
- privacy-safe UX measurement;
- BAZA checks;
- общий public desktop/mobile smoke;
- review threads: 0.

Общий browser workflow имеет conclusion `success`, но `authenticated-smoke` был `skipped`. Это не authenticated matrix PASS.

Первый CI-run упал только из-за замены legacy cache mapping. Исправление сохранило старый mapping и добавило отдельный active mapping; после этого все 12 workflow прошли.

## Post-merge source smoke

Канонический `main` подтверждает:

- explicit lifecycle импортирует и вызывает `applyAccessibleAsyncFeedback`;
- active import remap ведёт на `20260715-16`;
- runtime содержит только три известных action selector и три enum focus token;
- нет `fetch`, `rpc`, Supabase transport, storage, collector, `MutationObserver` или service-role материала;
- mutation handlers и role-aware permissions не менялись.

## Supabase и рабочие данные

PR #313 не выполнял Supabase read/write и не создавал новый live baseline.

Последний подтверждённый read-only baseline:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

Значения могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

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

P1 UX — landmarks, headings и screen-reader структура action-first экранов.

Цель:

`быстро найти рабочую область → понять её назначение → перейти к главному действию → не потерять контекст`

Требования:

1. Проверить dashboard, deals, deal card и manager workspace.
2. На странице должен быть один понятный `<main>` и один логичный `<h1>`.
3. Основные action-first секции должны иметь уникальные accessible names через heading или `aria-labelledby`.
4. Повторяющиеся `section.card` без названия не должны создавать бессмысленные landmarks.
5. KPI, фильтры, очередь, подтверждённый результат и следующий шаг должны иметь последовательную heading hierarchy.
6. Live status/alert не должен одновременно становиться лишним landmark.
7. Mobile progressive disclosure и desktop layout не менять.
8. Role-aware permissions, mutation semantics и focus continuity сохранить.
9. Добавить pure naming/heading policy, static contract и synthetic desktop/mobile screen-reader-oriented browser assertions.
10. Не добавлять RPC, storage, collector или backend.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — landmarks/headings и screen-reader names action-first блоков.
- P1 UX — проверка form labels, help/error association и `aria-describedby` после landmarks slice.
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
- accessible async feedback PR #313;
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

`@GitHub продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #313. Не повторяй privacy measurement, keyboard focus или async feedback. Начни landmarks/headings slice для dashboard, deals, deal card и manager: один main/h1, понятные accessible names action-first секций, последовательная heading hierarchy и отсутствие лишних unnamed landmarks. Сохрани mobile disclosure, role-aware permissions и mutation semantics. Без RPC, storage, collector, backend и платной Supabase branch.`
