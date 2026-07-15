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
- Открытых PR после merge #315 не было на момент подготовки handoff.

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

### PR #315 — screen-reader структура action-first экранов

Охвачены:

- dashboard;
- список сделок;
- карточка сделки;
- manager workspace.

Поведение:

- единственный `main` получает accessible name от единственного `h1`;
- основные action-first секции связываются с существующими `h2` через `aria-labelledby`;
- визуальные названия карточек сделок и менеджерских решений становятся заголовками уровня 3 без изменения тегов и вёрстки;
- KPI-блоки получают `role=group` и понятные имена, но не создают лишние landmarks;
- повторяющиеся области «Главное действие» и «Следующий шаг» получают уникальный контекст сделки или подтверждённого результата;
- безымянные `section.card` не продвигаются в landmarks;
- `role=status` и `role=alert` остаются live feedback и не становятся регионами;
- mobile progressive disclosure, desktop layout и keyboard focus continuity сохраняются.

Архитектура:

- `assets/js/nav-v2/screen-structure-model-v2.js` — pure naming/heading policy;
- `assets/js/nav-v2/screen-structure-v2.js` — bounded DOM-only runtime;
- интеграция через существующий `focus-continuity-v2.js` и mobile lifecycle;
- четыре import-map remap переводят shared dependency `focus-continuity-v2.js?v=20260715-01` на `20260715-02`;
- page entry-module budgets не увеличены;
- нет `MutationObserver`, RPC, storage, collector, network transport или backend.

## Проверки PR #315

Финальный head: `f2d92abac2bd3e45425fe2e288309686d19fbb22`.

PASS:

- screen structure semantic contract;
- screen structure static/privacy contract;
- JavaScript и Python syntax;
- synthetic Playwright desktop/mobile;
- один named `main` и один `h1` на каждом fixture surface;
- labelled action-first regions;
- level-three headings для рабочих карточек;
- contextual names повторяющихся manager regions;
- named KPI groups;
- отсутствие unnamed/live landmark promotion;
- полный Navigator v2 static suite;
- authenticated browser workflow `public-smoke`;
- mobile first screen;
- keyboard focus continuity;
- accessible async feedback;
- dashboard priority;
- deals work modes;
- deal action focus;
- SPN rework cycle;
- lawyer document cycle;
- completion evidence;
- manager action routes;
- manager confirmed results;
- privacy-safe UX measurement;
- BAZA checks;
- review threads: 0.

Общий authenticated browser workflow имеет conclusion `success`, но job `authenticated-smoke` был `skipped`. Это не authenticated matrix PASS и не снимает ручной gate #282.

Первый dedicated browser run упал только потому, что Playwright сопоставлял имя основной KPI-группы по подстроке и одновременно находил «дополнительную группу». Runtime и accessibility tree были корректны. Финальный тест использует точное accessible-name matching; повторный desktop/mobile run прошёл.

## Post-merge source smoke

Канонический `main` подтверждает:

- screen structure подключён через существующий focus/mobile lifecycle;
- четыре ежедневных экрана сохраняют исходные entry modules;
- runtime меняет только ARIA/name/heading attributes существующего DOM;
- рабочие карточки получают заголовки уровня 3 и связанное имя article;
- повторяющиеся manager action regions получают контекст текущей сделки;
- live statuses/alerts и безымянные cards не продвигаются в landmarks;
- нет `fetch`, `rpc`, Supabase transport, storage, collector, `MutationObserver` или service-role материала;
- mutation handlers, role-aware permissions, mobile ordering и desktop layout не менялись.

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

P1 UX — form labels, help/error association и `aria-describedby` на action-first экранах.

Цель:

`понять назначение поля → увидеть требования до ввода → получить связанную ошибку → исправить данные без потери контекста`

Требования:

1. Проверить формы и интерактивные поля dashboard, deals, deal card и manager workspace, включая dynamically injected enhancement blocks.
2. Каждый `input`, `select` и `textarea` должен иметь устойчивое accessible name через `<label for>`, wrapping label или явный `aria-labelledby`.
3. Placeholder не должен быть единственным именем поля.
4. Help text, формат, ограничения и criteria должны связываться через `aria-describedby` только с соответствующим полем или группой.
5. Ошибка должна иметь стабильный id и добавляться в `aria-describedby`, не заменяя существующую помощь.
6. Общая live error/status область не должна становиться описанием всех полей сразу.
7. Повторяющиеся формы документов, задач и комментариев должны получать уникальные ids без UUID, ФИО, адресов и свободного текста в telemetry/storage.
8. После исправления ошибка должна удаляться из связи, а постоянная помощь сохраняться.
9. Mobile progressive disclosure, desktop layout, focus continuity, role-aware permissions и mutation semantics сохранить.
10. Добавить pure association policy, static contract и synthetic desktop/mobile browser assertions.
11. Не добавлять RPC, storage, collector или backend.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — form labels, help/error association и `aria-describedby`.
- P1 UX — fieldset/legend и keyboard semantics повторяющихся choice groups после form-association slice.
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
- screen-reader landmarks/headings PR #315;
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

`@GitHub продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #315. Не повторяй privacy measurement, keyboard focus, async feedback или landmarks/headings. Начни form labels/help/error association slice для dashboard, deals, deal card и manager: устойчивые accessible names, связанный help/error через aria-describedby, сохранение постоянной помощи после исправления и отсутствие глобальной привязки live status ко всем полям. Сохрани mobile disclosure, focus continuity, role-aware permissions и mutation semantics. Без RPC, storage, collector, backend и платной Supabase branch.`
