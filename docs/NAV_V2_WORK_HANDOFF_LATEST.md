# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `90063c346974c0f8328d7528b5b6c34d46eda8a8` — merge PR #327.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Supabase status по последней проверке: `ACTIVE_HEALTHY`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #327 использовал существующий RPC, но не менял schema, grants, RPC definition/surface, Auth, Edge Functions или рабочие строки.
- Открытых PR после merge #327 не было на момент подготовки handoff.

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

### PR #318 и #321 — form labels/help/errors

Охвачены поля карточки и списка сделок:

- `dealStatus`;
- `newComment`;
- `spnReworkCompletionText`;
- `spnReworkReturnReason`;
- `lawyerDocumentNoteV2`;
- `dealSearch`;
- `dealFilter`.

Поведение:

- placeholder не является единственным именем;
- visual label связан через `for/id`;
- help связан через `aria-describedby`;
- client error связан через `aria-errormessage`;
- `aria-invalid` появляется только при реальной field error;
- correction/alternative очищают invalid state;
- server error не создаёт ложное invalid state.

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

Проведён bounded inventory десяти нативных `confirm/prompt` в основных deal-card flows.

Заменён маршрут:

`confirm изменения риска → отдельный prompt комментария`

на один controlled `<dialog>`.

- stable accessible name/description;
- в одном окне видны действие, название риска, последствия и demo warning;
- комментарий необязательный, но имеет label/help;
- Escape/Cancel не выполняют mutation;
- фокус возвращается к запускающей кнопке;
- draft хранится только в `WeakMap` по DOM-trigger;
- draft сохраняется после cancel и server error;
- draft очищается только после успешного `nav_v2_update_risk_resolution`;
- native fallback остаётся при отсутствии поддержки `<dialog>`.

### PR #327 — обязательная причина проблемы документа

Закрыт маршрут:

`нажать «Проблема» → увидеть документ и последствия → ввести обязательную причину → исправить inline validation → сохранить существующим RPC`

#### Поведение

- используется тот же shared `action-dialog-v2.js`, второй dialog runtime не создан;
- dialog показывает название документа и новое состояние «Проблема»;
- demo-сделка получает явное предупреждение внутри dialog;
- textarea имеет stable label/help;
- пустая причина остаётся внутри dialog;
- validation error связан через `aria-invalid` и `aria-errormessage`;
- поле с ошибкой получает фокус;
- Escape/Cancel закрывают dialog без mutation;
- фокус возвращается к кнопке «Проблема»;
- draft причины хранится только в shared `WeakMap`;
- draft сохраняется после cancel и server error;
- draft очищается только после успешного RPC;
- старый `prompt` остаётся только аварийным fallback, если enhancement не загрузился.

#### Mutation contract

Сохранён существующий RPC и payload:

- `nav_v2_update_document_workflow`;
- `p_document_id`;
- `p_status = 'problem'`;
- `p_assigned_to = null`;
- `p_responsible_role = null`;
- `p_due_date = null`;
- `p_note` с обязательной причиной.

Role permissions, document taxonomy, lawyer document cycle и SPN rework не менялись.

#### Архитектура

- `action-dialog-model-v2.js` расширен policy `deal-document-problem`;
- shared runtime получил prompt-only fallback через `fallbackConfirm=false`;
- новый bounded enhancement: `deal-card-document-problem-dialog-v2.js`;
- enhancement подключён после существующего document workflow через `deal-card-recheck-alert-v2.js`;
- risk/document dialog объединены одним import-map remap на `action-dialog-*-v2.js?v=20260715-02`;
- active hook remap: `deal-card-recheck-alert-v2.js?v=20260715-02` → `20260715-20`;
- legacy remap `20260711-02` → `20260715-15` сохранён;
- HTML entry-module budget не увеличен.

## Проверки PR #327

Финальный head: `e62aa8034c33616f5a353b39b9c2dbae058460f1`.

PASS — 16/16 workflow:

- JavaScript/Python syntax;
- full static suite и release integrity;
- shared action-dialog semantic/source contract;
- dedicated document-problem source/privacy contract;
- exact existing RPC payload;
- desktop/mobile Playwright;
- document context и demo warning;
- required reason и inline error;
- Escape/Cancel without mutation;
- focus return;
- memory-only draft recovery after cancel/server error;
- draft clear only after success;
- existing risk dialog regression;
- form association regression;
- accessible async feedback regression;
- keyboard focus continuity;
- screen structure;
- mobile first screen;
- SPN rework;
- lawyer document cycle;
- completion evidence;
- deal action focus;
- privacy-safe UX measurement;
- BAZA checks;
- public desktop/mobile smoke;
- review threads: 0.

Первый dedicated browser run упал только потому, что намеренно смоделированный HTTP 400 создавал стандартную браузерную запись `Failed to load resource` в `console.error`. Product recovery, status, payload и draft были корректны. Финальный тест фильтрует только точную ожидаемую запись mocked HTTP 400; остальные `console.error` и `pageerror` остаются запрещёнными. Повторный desktop/mobile run — PASS.

Workflow `Navigator v2 authenticated browser E2E` имеет conclusion `success`, но job `authenticated-smoke` был `skipped`. Это не authenticated matrix PASS и не снимает gate #282.

## Post-merge source smoke

Канонический `main` подтверждает:

- document enhancement связывается только с `[data-doc-id][data-doc-status="problem"]`;
- base document workflow выполняется до dialog enhancement;
- shared runtime один для risk и document flows;
- document module содержит ровно один существующий mutation RPC;
- draft очищается внутри success-path до reload;
- catch повторно разрешает кнопку и не очищает draft;
- storage, collector, telemetry, новый RPC и новый HTML entry module не добавлены;
- active release `deal-card-recheck-alert-v2.js?v=20260715-20` опубликован.

## Supabase и рабочие данные

PR #327 не выполнял Supabase read/write и не менял backend.

Подтверждено ранее 15 июля:

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

P1 UX — controlled review передачи юристу с длинным issue list (`deal-lawyer-handoff`).

Цель:

`нажать «Передать юристу» → увидеть все незакрытые пункты и последствия → подтвердить осознанную передачу или вернуться к исправлению → сохранить существующим status RPC`

Требования:

1. Использовать существующие `action-dialog-model-v2.js` и `action-dialog-v2.js`; второй runtime не создавать.
2. Заменить только длинный `confirmLawyerHandoff()` при наличии незакрытых пунктов.
3. Если список препятствий пуст, сохранить прямое действие без лишнего dialog.
4. Dialog должен показывать все issue items, итоговое действие и demo warning.
5. Причина/комментарий не обязательны, если текущий business rule их не требует.
6. Escape/Cancel не выполняют mutation и возвращают фокус к исходной кнопке.
7. Сохранить `nav_v2_update_deal_status` и payload `p_status='need_lawyer'` без изменений.
8. Не менять role permissions, quick status taxonomy, lawyer cycle или manager routing.
9. Native fallback должен оставаться bounded и не создавать второй confirm после dialog.
10. Добавить semantic/source contract и desktop/mobile regression.
11. Без новых RPC, storage, collector, telemetry, backend или Supabase branch.

После этого провести небольшой post-dialog recovery audit только трёх изменённых flows: risk, document problem, lawyer handoff.

Measurement backend остаётся заблокирован до решения о denominator, дедупликации, минимальной выборке, retention, доступах и privacy review.

## NEXT_WORK_QUEUE

- P1 UX — controlled review для lawyer handoff с длинным issue list.
- P1 UX — post-dialog recovery audit трёх изменённых flows.
- P1 MANUAL MEASUREMENT — collector/aggregation/retention/access policy.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot evidence-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- action-first dashboard/list/card/manager;
- SPN rework и lawyer document lifecycle;
- completion evidence и manager confirmed results;
- mobile first screen;
- privacy-safe measurement contract;
- keyboard/focus continuity;
- async feedback;
- landmarks/headings;
- form labels и choice-group semantics;
- risk action dialog PR #325;
- document problem dialog PR #327;
- новый collector/storage/telemetry backend без отдельного решения;
- duplicate/pilot/responsibility mutations без evidence/owner decision;
- isolated authenticated E2E без exact cost approval.

## Команда следующего запуска

`@GitHub продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #327. Начни отдельный slice deal-lawyer-handoff: переиспользуй shared action dialog для длинного списка незакрытых пунктов, сохрани прямой action без dialog при пустом списке и существующий nav_v2_update_deal_status payload need_lawyer. Escape/Cancel without mutation, focus return, demo context. Не трогай другие confirm/prompt. Без новых RPC, storage, collector, telemetry, backend и платной Supabase branch.`
