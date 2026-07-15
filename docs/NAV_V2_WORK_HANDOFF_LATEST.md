# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `640616e5835d667b82f4aab459e97741c2eb1833` — merge PR #325.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Supabase status: `ACTIVE_HEALTHY`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- Последние UX-срезы frontend/tests-only: schema, grants, RPC surface, Auth, Edge Functions и рабочие строки не менялись.
- Открытых PR после merge #325 не было на момент подготовки handoff.

## Завершённая продуктовая цепочка

### PR #288–#292 — action-first основа

- dashboard показывает объяснимые приоритеты;
- список сделок имеет role-aware рабочие режимы;
- карточка показывает одно главное действие, ответственного, срок и критерий результата;
- менеджерские кнопки ведут в конкретный remediation workspace.

### PR #294 — единый цикл доработки СПН

`замечание → где исправить → сохранить → повторно отправить → увидеть серверное подтверждение`

### PR #296 — документный цикл юриста

`нужен → запрошен → получен → проверен / проблема`

### PR #298–#300 — подтверждённый результат

- audit event принимается только при совпадении с текущим состоянием;
- stale/no-op/backward события отбрасываются;
- manager видит backlog и server-confirmed результаты;
- manager workspace остаётся read-only.

### PR #302 — мобильный первый экран

На 360–430 px главное действие показывается до KPI и вторичных списков. Desktop остаётся раскрытым.

### PR #306 — privacy-safe UX measurement contract

- только локальный enum-only `CustomEvent`;
- нет UUID, URL, ФИО, адресов, комментариев и свободного текста;
- нет storage, network transport, RPC или collector;
- click не считается подтверждённым результатом.

### PR #309 — keyboard/focus continuity

- `:focus-visible`, forced-colors fallback и reduced-motion;
- disclosure получает `aria-expanded`/`aria-controls`;
- keyboard-переход фокусирует рабочий panel;
- pointer-навигация не получает принудительный focus jump.

### PR #313 — accessible async feedback

`действие → busy → success/error → server-confirmed reload → следующий фокус`

- busy: `role=status`, `aria-live=polite`, `aria-busy=true`;
- error: `role=alert`, `aria-live=assertive`;
- keyboard error получает фокус, pointer action — нет;
- введённые данные сохраняются;
- success использует allowlisted enum `nav_focus`.

### PR #315 — screen-reader структура

- один named `main` от одного `h1`;
- action-first секции связаны с `h2`;
- рабочие карточки имеют heading level 3;
- KPI — named `role=group`;
- live status/alert не становятся лишними landmarks.

### PR #318 — form labels/help/errors

Охвачены `dealStatus`, `newComment`, `spnReworkCompletionText`, `spnReworkReturnReason`, `lawyerDocumentNoteV2`.

- visual label связан через `for/id`;
- help связан через `aria-describedby`;
- client error связан через `aria-errormessage`;
- `aria-invalid` появляется только при реальной field error;
- correction/alternative очищают invalid state;
- server error не создаёт ложное invalid state.

### PR #321 — search/filter semantics

- `dealSearch` — «Поиск сделок»;
- `dealFilter` — «Режим списка сделок»;
- placeholder больше не является единственным именем;
- отдельный help доступен всем ролям;
- новый entry module не добавлен.

### PR #323 — повторяющиеся choice groups

Охвачены:

1. замечания для возврата СПН;
2. быстрые статусы сделки;
3. юридические решения;
4. состояния текущего документа.

- checkbox group получает нативный `fieldset/legend`;
- button groups получают bounded `role=group`;
- общий help связан через `aria-describedby`;
- индивидуальные control names сохраняются;
- Tab/Space/Enter остаются нативными;
- field/group error используют один существующий status;
- positive tabindex не добавляется.

### PR #325 — controlled dialog изменения риска

Проведён bounded inventory нативных `confirm/prompt` в основных deal-card flows.

Заменён только подтверждённо проблемный маршрут:

`confirm изменения риска → отдельный prompt комментария`

на один controlled `<dialog>`.

#### Поведение

- stable accessible name/description;
- в одном окне видны действие, название риска, последствия и demo warning;
- комментарий необязательный, но имеет label/help;
- Escape и «Отмена» закрывают диалог без mutation;
- фокус возвращается к запускающей кнопке;
- комментарий хранится только в `WeakMap` по DOM-trigger;
- draft сохраняется после cancel и server error;
- draft очищается только после успешного `nav_v2_update_risk_resolution`;
- при отсутствии поддержки `<dialog>` остаётся native fallback;
- positive tabindex, storage и telemetry не добавляются.

#### Mutation contract

Сохранены без изменений:

- role-aware `canAttemptMutation`;
- RPC `nav_v2_update_risk_resolution`;
- `p_risk_id`;
- `p_is_resolved`;
- `p_note`;
- idempotent server response;
- reload после подтверждённого результата.

#### Inventory decisions

Оставлены нативными:

- короткие demo guards;
- SPN rework confirms, где контекст уже виден в форме;
- lawyer document confirm, где документ, действие и комментарий находятся в одном блоке.

Следующие отдельные кандидаты:

1. `deal-document-problem` — обязательная причина проблемного документа;
2. `deal-lawyer-handoff` — длинное подтверждение с перечнем незакрытых пунктов.

Не смешивать эти два сценария в один PR.

## Проверки PR #325

Финальный head: `d8a107b2b15aede29d0f304e8a43ad67b779b244`.

PASS:

- JavaScript/Python syntax;
- pure inventory/policy semantic contract;
- static/source/privacy contract;
- risk lifecycle contract;
- RPC registry и release integrity;
- module budgets;
- desktop/mobile Playwright;
- accessible dialog name/description;
- demo context;
- Escape/cancel without mutation;
- focus return;
- memory-only draft lifecycle;
- draft preserved after cancel/server-error simulation;
- draft cleared only after success;
- reusable required-input validation;
- no positive tabindex;
- compatible form association;
- compatible async feedback;
- SPN rework;
- lawyer document cycle;
- completion evidence;
- deal action focus;
- mobile first screen;
- keyboard focus continuity;
- screen structure;
- privacy-safe UX measurement;
- BAZA checks;
- public desktop/mobile smoke;
- review threads: 0.

Первый общий static run выявил устаревший risk lifecycle contract: он ожидал import `deal-card-risk-resolution-v2.js?v=20260712-10`. Контракт обновлён на `20260715-01` и дополнен проверками controlled dialog. Повторный полный run — PASS.

Workflow `Navigator v2 authenticated browser E2E` имеет conclusion `success`, но внутри `authenticated-smoke` остаётся `skipped`. Это не authenticated matrix PASS.

## Post-merge source smoke

Канонический `main` подтверждает:

- inventory содержит десять классифицированных native-dialog сценариев;
- только `risk-resolution` помечен `replace_now`;
- document problem и lawyer handoff остаются отдельными candidates;
- dialog runtime использует DOM API и `WeakMap`, без `innerHTML`;
- runtime не использует RPC, Supabase transport, storage, collector или telemetry;
- risk module содержит ровно один существующий mutation RPC;
- `confirm()`/`prompt()` удалены только из risk module;
- новый HTML entry module не добавлен;
- active cache remap: `deal-card-recheck-alert-v2.js?v=20260715-02` → `20260715-19`;
- legacy remap `20260711-02` → `20260715-15` сохранён.

## Supabase и рабочие данные

PR #323 и #325 не выполняли Supabase read/write.

Подтверждено 15 июля:

- project status: `ACTIVE_HEALTHY`;
- branches: только production `main`;
- latest live migration: `20260714125054`.

Последний read-only baseline до frontend-срезов:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118.

Counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Ручные gates

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

P1 UX — обязательная причина проблемного документа (`deal-document-problem`).

Цель:

`выбрать «Проблема» → увидеть документ и последствия → ввести обязательную причину → исправить inline validation → подтвердить → сохранить существующим RPC`

Требования:

1. Использовать уже созданный `action-dialog-v2.js`; не создавать второй dialog runtime.
2. Заменить только `prompt('Что не так с документом?')` в базовой карточке.
3. Причина обязательна по существующему business rule; сохранить проверку непустого значения.
4. Dialog должен показывать название документа и выбранное состояние.
5. Escape/Cancel не выполняют mutation.
6. После cancel/server error введённая причина сохраняется memory-only.
7. После успешного RPC draft очищается.
8. Validation error остаётся внутри dialog, связывается через `aria-invalid`/`aria-errormessage` и фокусирует textarea.
9. Сохранить `nav_v2_update_document_workflow` и payload без изменений.
10. Не менять lawyer document cycle, SPN rework, role permissions или document status taxonomy.
11. Добавить source/static и desktop/mobile regression.
12. Без новых RPC, storage, collector, telemetry, backend или Supabase branch.

После этого отдельным PR рассмотреть `deal-lawyer-handoff`.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — controlled required-reason dialog для проблемного документа.
- P1 UX — отдельный controlled review для lawyer handoff с длинным issue list.
- P1 UX — post-dialog recovery audit только изменённых flows.
- P1 MANUAL MEASUREMENT — collector/aggregation/retention/access policy.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot evidence-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #325. Начни отдельный slice deal-document-problem: переиспользуй action-dialog-v2 для обязательной причины проблемного документа, сохрани nav_v2_update_document_workflow и payload, memory-only draft, Escape/Cancel without mutation, focus return и inline validation. Не трогай lawyer handoff в этом PR. Без новых RPC, storage, collector, telemetry, backend и платной Supabase branch.`
