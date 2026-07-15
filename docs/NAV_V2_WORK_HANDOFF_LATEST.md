# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `3cc5a5c8ad1653005b1b2c041303bad0b05b2b90` — merge PR #315.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main` по последней проверке.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #315 frontend/tests-only: schema, grants, RPC, Auth, Edge Functions и рабочие строки не менялись.
- Открытых PR после merge #315: нет на момент подготовки handoff.

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

Охвачены повторная отправка СПН, возврат СПН и изменение состояния документа юристом.

- busy: `role=status`, `aria-live=polite`, `aria-busy=true`;
- error: `role=alert`, `aria-live=assertive`;
- keyboard error получает фокус, pointer action не получает принудительный focus jump;
- активное поле и введённые данные сохраняются;
- повторные announcements подавляются;
- success использует только разрешённый enum `nav_focus`;
- после reload фокус попадает на подтверждённый результат либо следующий action block;
- служебный query-параметр удаляется после применения.

### PR #315 — screen-reader структура action-first экранов

Добавлен общий bounded DOM-only слой для dashboard, deals, deal card и manager workspace.

Структура страницы:

- единственный `main` получает accessible name от единственного `h1`;
- основные action-first секции связываются с существующими `h2` через `aria-labelledby`;
- визуальные названия сделок и менеджерских решений становятся heading level 3 без изменения тегов и внешнего вида;
- KPI-блоки получают `role=group` и понятные названия вместо дополнительных landmarks;
- повторяющиеся manager-области `Главное действие` и `Следующий шаг` получают уникальный контекст сделки или результата;
- безымянные `section.card` не продвигаются в landmarks;
- `role=status` и `role=alert` сохраняются как live feedback и не становятся лишними регионами.

Архитектура:

- `assets/js/nav-v2/screen-structure-model-v2.js` — pure policy;
- `assets/js/nav-v2/screen-structure-v2.js` — bounded DOM-only runtime;
- runtime подключён через существующий `focus-continuity-v2.js`;
- entry-module budgets не увеличены;
- visual order, mobile disclosure, desktop layout, focus continuity, permissions и mutation handlers не менялись;
- нет RPC, storage, collector, network transport, `MutationObserver` или backend.

## Проверки PR #315

Финальный head: `f2d92abac2bd3e45425fe2e288309686d19fbb22`.

PASS:

- screen structure semantic contract;
- screen structure static/privacy contract;
- JavaScript и Python syntax;
- synthetic Playwright desktop/mobile;
- один named `main` и один `h1`;
- named regions и named KPI groups;
- level-3 headings для рабочих карточек;
- уникальные контекстные имена manager regions;
- отсутствие unnamed/live landmark promotion;
- полный Navigator v2 static suite и module budgets;
- dashboard priority;
- deals work modes;
- SPN rework cycle;
- lawyer document cycle;
- completion evidence;
- deal action focus;
- manager action routes;
- manager confirmed results;
- mobile first screen;
- keyboard focus continuity;
- accessible async feedback;
- privacy-safe UX measurement;
- BAZA checks;
- общий public desktop/mobile smoke;
- review threads: 0.

Первый dedicated browser run выявил только неточное Playwright-сопоставление: имя `Показатели карточки сделки` частично совпадало с `Показатели карточки сделки, дополнительная группа`. Runtime и accessible names не менялись; assertions переведены на `exact: true`. Повторный desktop/mobile run — PASS.

Общий browser workflow имеет conclusion `success`, но `authenticated-smoke` был `skipped`. Это не authenticated matrix PASS.

## Post-merge source smoke

Канонический `main` подтверждает:

- `screen-structure-model-v2.js` содержит политики только для четырёх известных поверхностей;
- `screen-structure-v2.js` связывает регионы с существующими headings и не создаёт новые визуальные блоки;
- KPI используют `role=group`, а не дополнительные landmarks;
- manager nested regions получают контекстное имя от родительской сделки или результата;
- live status/alert не получают `aria-labelledby`;
- `focus-continuity-v2.js` вызывает `applyScreenStructure` перед focus enhancement;
- нет `fetch`, RPC, Supabase transport, storage, collector, `MutationObserver` или service-role материала;
- mutation handlers и role-aware permissions не менялись.

## Supabase и рабочие данные

PR #315 не выполнял Supabase read/write и не создавал новый live baseline.

Последний подтверждённый read-only baseline:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

Значения могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Ручные gates

Проверены 15 июля. Не перепроверять после каждого frontend-среза без нового сигнала.

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

P1 UX — form labels, help/error association и validation recovery.

Цель:

`понять поле → увидеть обязательность и подсказку → получить связанную ошибку → исправить данные без потери контекста`

Требования:

1. Проверить формы и inline controls карточки сделки, SPN rework и lawyer document cycle.
2. Каждый input/select/textarea должен иметь программно связанный label.
3. Подсказки и критерии заполнения связывать через `aria-describedby`, а не только визуальное соседство.
4. Ошибка поля должна использовать отдельный id и `aria-describedby` или `aria-errormessage` без дублирующих live announcements.
5. `aria-invalid=true` ставить только на фактически ошибочное поле и снимать после исправления.
6. При server error сохранять введённые данные и существующую async focus policy.
7. Не добавлять положительный tabindex и не менять mobile disclosure/layout.
8. Не менять role-aware permissions, mutation semantics или RPC payload.
9. Добавить pure association policy, static contract и synthetic desktop/mobile Playwright.
10. Не добавлять RPC, storage, collector или backend.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — form labels, help/error association, `aria-describedby` и validation recovery.
- P1 UX — keyboard review диалогов `confirm/prompt` и безопасная замена только после form association slice.
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
- screen-reader structure PR #315;
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

`@GitHub продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #315. Не повторяй privacy measurement, keyboard focus, async feedback или screen structure. Начни form association slice: labels, aria-describedby/aria-errormessage, точный aria-invalid и сохранение контекста ошибки для deal card, SPN rework и lawyer document cycle. Сохрани focus/mobile/role-aware/mutation semantics. Без RPC, storage, collector, backend и платной Supabase branch.`
