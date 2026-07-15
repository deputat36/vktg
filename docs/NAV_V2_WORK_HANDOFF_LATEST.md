# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `a260d91a2715751906b88caa980480100a6daaad` — merge PR #323.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Supabase status: `ACTIVE_HEALTHY`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #318, #321 и #323 frontend/tests-only: schema, grants, RPC, Auth, Edge Functions и рабочие строки не менялись.
- Открытых PR после merge #323 не было на момент подготовки handoff.

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
- success использует только разрешённый enum `nav_focus`;
- после reload фокус попадает на подтверждённый результат либо следующий action block;
- нет RPC, storage, collector, `MutationObserver` или backend.

### PR #315 — screen-reader структура action-first экранов

Охвачены dashboard, deals, deal card и manager workspace.

- единственный `main` получает accessible name от единственного `h1`;
- action-first секции связываются с существующими `h2` через `aria-labelledby`;
- названия рабочих карточек становятся heading level 3 без изменения внешнего вида;
- KPI получают named `role=group`, а не лишние landmarks;
- повторяющиеся manager regions получают контекст сделки или результата;
- live status/alert не превращаются в дополнительные регионы;
- page entry-module budgets не увеличены.

### PR #318 — form labels, help и точные field errors

Закрыт маршрут:

`понять поле → увидеть требования → получить связанную ошибку → исправить данные без потери контекста`

Охвачены:

1. `dealStatus`;
2. `newComment`;
3. `spnReworkCompletionText`;
4. `spnReworkReturnReason`;
5. `lawyerDocumentNoteV2`.

Поведение:

- visual label связывается через `for/id`;
- постоянная подсказка связывается через `aria-describedby`;
- client validation связывает поле со status через `aria-errormessage`;
- `aria-invalid=true` ставится только при реальной ошибке конкретного поля;
- invalid/error association снимается после исправления или выбора альтернативы;
- server error не делает корректно заполненное поле ошибочным;
- общий async feedback остаётся единственным владельцем live announcements;
- positive tabindex не добавляется.

### PR #321 — accessible names и help для фильтров сделок

Охвачены:

1. `dealSearch` — «Поиск сделок»;
2. `dealFilter` — «Режим списка сделок».

- placeholder поиска больше не является единственным accessible name;
- при отсутствии visual label runtime добавляет bounded `aria-label`;
- каждому полю добавляется отдельный help через `aria-describedby`;
- search/filter остаются необязательными и не получают ложный `aria-invalid`;
- новый entry module не добавлен;
- filtering, URL state, RPC, permissions и layout не менялись.

### PR #323 — семантика повторяющихся choice groups

Закрыт маршрут:

`понять назначение группы → услышать общее требование → пройти варианты нативной клавиатурой → выбрать вариант → получить или снять связанную ошибку`

Охвачены четыре группы:

1. замечания для возврата СПН;
2. быстрые статусы сделки;
3. юридические решения по сделке;
4. состояния текущего документа.

Поведение:

- `.spn-rework-options` преобразуется в нативный `fieldset` с `legend`, дочерние checkbox и их labels сохраняются;
- три набора кнопок получают bounded `role=group` и стабильное имя;
- каждая группа получает общий help через `aria-describedby`;
- индивидуальные accessible names checkbox и кнопок сохраняются;
- checkbox использует нативный Tab/Space;
- кнопки используют нативный Tab/Enter/Space;
- положительный `tabindex` не добавляется;
- ошибка правила `checkbox ИЛИ текст` связывается с fieldset и textarea через один существующий `spnReworkStatusV2`;
- условная ошибка комментария юриста связывается с textarea и группой состояний документа;
- после исправления `aria-invalid` и `aria-errormessage` снимаются с поля и группы;
- server error после корректного ввода не создаёт ложное invalid-состояние;
- двойной live announcement не добавляется.

Архитектура:

- pure group policy добавлена в `form-association-model-v2.js`;
- bounded DOM-only runtime остаётся в `form-association-v2.js`;
- интеграция идёт через существующий `deal-card-recheck-alert-v2.js`;
- active cache remap: `deal-card-recheck-alert-v2.js?v=20260715-02` → `20260715-18`;
- legacy remap `20260711-02` → `20260715-15` сохранён;
- новый page entry-module не добавлен;
- mutation handlers, RPC payload, role-aware permissions и business rules не менялись;
- нет storage, network, collector, telemetry, Supabase schema или backend.

## Проверки PR #323

Финальный head: `1a8677dd7dbf05ae17c78bc703a066906bb8ad54`.

PASS:

- JavaScript и Python syntax;
- pure semantic group policy contract;
- static/source/privacy contract;
- compatible async feedback contract;
- dedicated Playwright desktop/mobile;
- stable accessible names четырёх групп;
- shared accessible descriptions;
- native `fieldset/legend`;
- сохранение индивидуальных имён controls;
- checkbox Space selection;
- отсутствие positive tabindex;
- shared field/group error association и recovery;
- conditional lawyer validation;
- server error без ложного invalid state;
- полный существующий form labels/errors regression;
- Navigator v2 static checks и module budgets;
- SPN rework cycle;
- lawyer document cycle;
- completion evidence;
- deal action focus;
- mobile first screen;
- keyboard focus continuity;
- screen structure;
- accessible async feedback;
- privacy-safe UX measurement;
- BAZA checks;
- public desktop/mobile smoke;
- review threads: 0.

Workflow `Navigator v2 authenticated browser E2E` имеет conclusion `success`, но внутри:

- `public-smoke`: PASS;
- `authenticated-smoke`: SKIPPED.

Это не authenticated matrix PASS и не заменяет isolated target.

### Исправление по фактическому CI evidence

Первый run PR #323 выявил только устаревший release marker в compatibility contract `check_nav_v2_async_feedback.py`: контракт ожидал cache remap `20260715-17`, тогда как choice-group release использует `20260715-18`. Marker обновлён. Runtime, semantic и static checks на первом run уже были зелёными. Повторный полный прогон — PASS.

## Post-merge source smoke

Канонический `main` подтверждает:

- pure policy ограничена семью field ids и четырьмя group ids;
- checkbox group получает нативный fieldset без замены input/label;
- button groups получают только `role=group`, name и description;
- default border/padding fieldset сбрасываются без изменения grid и mobile layout;
- одна client error association используется полем и связанной группой;
- correction и alternative selection очищают invalid state;
- runtime не использует `fetch`, RPC, Supabase transport, storage, collector или `MutationObserver`;
- focus policy, async feedback, filtering, URL state, mutation semantics и permissions не менялись.

## Supabase и рабочие данные

PR #318, #321 и #323 не выполняли Supabase read/write и не создавали новый live baseline.

Подтверждено 15 июля:

- project status: `ACTIVE_HEALTHY`;
- branches: только production `main`;
- latest live migration: `20260714125054`.

Последний read-only baseline до этих frontend-срезов:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118.

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
- не создавать Supabase branch, Auth users, secrets или synthetic target.

## Следующий безопасный продуктовый slice

P1 UX — review нативных `confirm/prompt` и bounded accessible dialog replacement.

Цель:

`понять необратимое действие → проверить контекст и последствия → подтвердить или отменить клавиатурой → при ошибке вернуться к исходному полю без потери данных`

Требования:

1. Провести inventory всех `confirm()` и `prompt()` в основных deal-card flows.
2. Разделить их на:
   - простое безопасное подтверждение;
   - подтверждение с важным контекстом/риском;
   - ввод обязательной причины;
   - demo guard.
3. Не заменять нативный диалог только ради замены. Controlled dialog допустим там, где улучшает recovery, контекст или доступность.
4. Для controlled dialog использовать нативный `<dialog>` при подтверждённой совместимости; иначе bounded `role=dialog` с корректным focus trap и возвратом фокуса.
5. Заголовок, описание, последствия, primary/cancel actions должны иметь стабильные accessible names.
6. Escape и Cancel не выполняют mutation.
7. После закрытия фокус возвращается к запускающему control; после validation error — к связанному полю.
8. Введённый комментарий/причина не теряется при cancel или server error.
9. Не менять mutation handlers, RPC names/payload, confirmation conditions, role-aware permissions или business rules.
10. Добавить pure dialog policy, static/privacy contract и synthetic desktop/mobile Playwright.
11. Не добавлять RPC, storage, collector, telemetry или backend.

После dialog slice:

- провести короткий end-to-end UX audit только изменённых action-first flows;
- не возвращаться к общему техническому аудиту без нового сигнала.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — inventory `confirm/prompt` и bounded accessible dialog replacement.
- P1 UX — post-dialog end-to-end recovery audit изменённых flows.
- P1 MANUAL MEASUREMENT — решение о collector/aggregation/retention/access policy.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot evidence-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #323. Начни inventory native confirm/prompt в основных deal-card flows и замени только те диалоги, где bounded accessible dialog улучшает контекст, keyboard recovery или обязательный ввод причины. Сохрани mutation handlers, RPC payload, role-aware permissions, business rules, mobile disclosure, focus continuity и async feedback. Без RPC, storage, collector, telemetry, backend и платной Supabase branch.`
