# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `2d9d2b779f79c11652d707335beba9792736a5da` — merge PR #318.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main` по последней проверке.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #318 frontend/tests-only: schema, grants, RPC, Auth, Edge Functions и рабочие строки не менялись.
- Открытых PR после merge #318 не было на момент подготовки handoff.

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

### PR #298–#300 — подтверждённый результат и менеджерский контроль

- audit event принимается только при совпадении с текущим состоянием;
- no-op, обратные, повторно открытые и старые события отбрасываются;
- после подтверждённого результата выбирается следующий шаг;
- manager отдельно видит backlog и server-confirmed результаты;
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

Охвачены повторная отправка СПН, возврат СПН и документный цикл юриста.

- busy: `role=status`, `aria-live=polite`, `aria-busy=true`;
- error: `role=alert`, `aria-live=assertive`;
- keyboard error получает фокус, pointer action не получает принудительный focus jump;
- активное поле и введённые данные сохраняются;
- повторные announcements подавляются;
- success использует только разрешённый enum `nav_focus`;
- после reload фокус попадает на подтверждённый результат либо следующий action block;
- нет RPC, storage, collector, `MutationObserver` или backend.

### PR #315 — screen-reader структура action-first экранов

Охвачены dashboard, deals, deal card и manager workspace.

- единственный `main` получает accessible name от единственного `h1`;
- action-first секции связываются с существующими `h2` через `aria-labelledby`;
- названия рабочих карточек становятся heading level 3 без изменения тегов и внешнего вида;
- KPI получают named `role=group`, а не лишние landmarks;
- повторяющиеся manager regions получают контекст сделки или результата;
- live status/alert не превращаются в дополнительные регионы;
- runtime подключён через существующий focus/mobile lifecycle;
- page entry-module budgets не увеличены.

### PR #318 — form labels, help и точные field errors

Закрыт маршрут:

`понять поле → увидеть требования → получить связанную ошибку → исправить данные без потери контекста`

Охвачены пять полей карточки сделки:

1. `dealStatus` — текущий статус сделки;
2. `newComment` — комментарий команды;
3. `spnReworkCompletionText` — что исправлено СПН;
4. `spnReworkReturnReason` — причина возврата с альтернативой checkbox;
5. `lawyerDocumentNoteV2` — условно обязательный комментарий юриста.

Поведение:

- существующий visual label связывается с полем через `for/id`;
- постоянная подсказка связывается через `aria-describedby`;
- client validation связывает поле с существующим status через `aria-errormessage`;
- `aria-invalid=true` ставится только при реальной ошибке конкретного поля;
- invalid/error association снимается после исправления или выбора допустимой альтернативы;
- server error не делает корректно заполненное поле ошибочным;
- общий async feedback остаётся единственным владельцем live announcements;
- checkbox-замечания возврата СПН получают named `role=group`;
- placeholder не используется как единственное имя поля;
- positive tabindex не добавляется.

Архитектура:

- `assets/js/nav-v2/form-association-model-v2.js` — pure field/validation policy;
- `assets/js/nav-v2/form-association-v2.js` — bounded delegated DOM-only runtime;
- интеграция через существующий `deal-card-recheck-alert-v2.js`;
- active cache remap: `deal-card-recheck-alert-v2.js?v=20260715-02` → `20260715-17`;
- legacy remap `20260711-02` → `20260715-15` сохранён;
- entry-module budget не увеличен;
- feature RPC, payload, role-aware permissions и mutation handlers не менялись;
- нет storage, network, collector, `MutationObserver` или backend.

## Проверки PR #318

Финальный head: `84ed3789ec21e21f1a59ef6ab4a5945c1368f1ca`.

PASS:

- form association semantic contract;
- static/privacy contract;
- JavaScript и Python syntax;
- совместимость с accessible async feedback;
- synthetic Playwright desktop/mobile — 12 сценариев;
- programmatic labels и accessible names;
- help associations через `aria-describedby`;
- field errors через `aria-errormessage`;
- SPN completion required/min-length validation;
- правило возврата `checkbox ИЛИ текст минимум 10 символов`;
- conditional lawyer note requirement;
- server error без ложного `aria-invalid`;
- сохранение введённых данных;
- очистка invalid state после исправления;
- полный Navigator v2 static suite и module budgets;
- deal action focus;
- SPN rework cycle;
- lawyer document cycle;
- completion evidence;
- mobile first screen;
- keyboard focus continuity;
- screen structure;
- accessible async feedback;
- privacy-safe UX measurement;
- BAZA checks;
- общий public desktop/mobile smoke;
- review threads: 0.

Общий browser workflow имеет conclusion `success`, но `authenticated-smoke` был `skipped`. Это не authenticated matrix PASS.

### Исправления по фактическому browser evidence

Первый dedicated browser run выявил порядок delegated events: capture-listener форм проверял status до штатного action handler. Listener перенесён в bubble phase, а проверка остаётся в microtask, поэтому сначала выполняется существующая feature validation, затем добавляется ARIA association.

Второй run выявил ошибку pure policy: пустая причина возврата считалась допустимой при отсутствии checkbox. Политика исправлена: поле допустимо только если выбран хотя бы один checkbox либо введён текст минимум 10 символов. Добавлена отдельная semantic-регрессия для пустого значения без альтернативы.

Третий desktop/mobile run — PASS.

## Post-merge source smoke

Канонический `main` подтверждает:

- pure policy ограничена пятью известными field ids;
- постоянная помощь не удаляется после очистки ошибки;
- `aria-invalid` и `aria-errormessage` удаляются при исправлении;
- server error связывается с полем только когда client state действительно invalid;
- click validation выполняется после существующего action handler;
- checkbox change немедленно пересчитывает альтернативное правило;
- runtime не использует `fetch`, RPC, Supabase transport, storage, collector или `MutationObserver`;
- layout, focus policy, mutation semantics и role-aware permissions не менялись.

## Supabase и рабочие данные

PR #318 не выполнял Supabase read/write и не создавал новый live baseline.

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

P1 UX — семантика повторяющихся choice groups.

Цель:

`понять вопрос группы → пройти варианты клавиатурой → услышать общее требование → выбрать допустимую альтернативу → сохранить связанный field error`

Требования:

1. Проверить повторяющиеся checkbox/radio/select groups в deal card, SPN rework и lawyer document flow.
2. Использовать нативные `fieldset/legend`, где это не ломает layout; иначе bounded `role=group` + `aria-labelledby`.
3. Группа должна иметь одно стабильное имя и общий help text.
4. Индивидуальный checkbox/radio должен сохранять собственное accessible name.
5. Ошибка альтернативного правила должна связываться с группой и текстовым полем без двойного live announcement.
6. Keyboard navigation должна использовать нативный Tab/Space/Arrow behaviour без положительного tabindex.
7. Mobile disclosure, desktop layout, focus continuity и async feedback сохранить.
8. Не менять mutation handlers, RPC payload, role-aware permissions или business rules.
9. Добавить pure group policy, static contract и synthetic desktop/mobile Playwright.
10. Не добавлять RPC, storage, collector или backend.

После choice-group slice:

- проверить нативные `confirm/prompt` в карточке;
- заменить только те диалоги, где accessible controlled dialog улучшит recovery без изменения mutation semantics.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — fieldset/legend и keyboard semantics повторяющихся choice groups.
- P1 UX — review нативных `confirm/prompt` и bounded accessible dialog replacement.
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
- form association PR #318;
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

`@GitHub продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #318. Не повторяй privacy measurement, keyboard focus, async feedback, screen structure или form association. Начни choice-group semantics slice: fieldset/legend или bounded role=group + aria-labelledby, общий help/error context и native keyboard behaviour для checkbox/radio groups в deal card/SPN rework/lawyer cycle. Сохрани mobile disclosure, focus continuity, async feedback, role-aware permissions и mutation semantics. Без RPC, storage, collector, backend и платной Supabase branch.`
