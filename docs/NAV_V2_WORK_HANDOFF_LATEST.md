# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `4a9c404ee14c19fb8f5e67a9ab632f894fc2f7eb` — merge PR #331.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последний подтверждённый статус проекта: `ACTIVE_HEALTHY`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- PR #329 и #331 не меняли schema, grants, RPC definitions, Auth, Edge Functions или рабочие строки.
- Открытых PR после merge #331 не было на момент подготовки handoff.

## Что уже завершено

### PR #288–#302 — action-first основа

- role-aware dashboard и список сделок;
- одно главное действие в карточке;
- manager remediation routes;
- цикл доработки СПН;
- документный цикл юриста;
- server-confirmed completion evidence;
- manager confirmed results;
- mobile operational first screen.

### PR #306–#323 — privacy и accessibility foundation

- privacy-safe enum-only UX contract без collector/storage;
- keyboard/focus continuity;
- accessible busy/success/error feedback;
- named main/regions/groups и heading hierarchy;
- form labels, help/error association;
- choice-group semantics.

### PR #325 — controlled dialog риска

- один dialog вместо confirm + prompt;
- действие, риск, последствия и demo warning в одном окне;
- Escape/Cancel без mutation;
- focus return;
- необязательный комментарий хранится только в памяти;
- draft сохраняется после cancel/server error и очищается после успеха;
- существующий risk RPC и payload не менялись.

### PR #327 — обязательная причина проблемы документа

- shared dialog показывает документ и новое состояние;
- причина обязательна;
- inline error связан через `aria-invalid` и `aria-errormessage`;
- Escape/Cancel без mutation;
- focus return;
- memory-only draft recovery;
- существующий document RPC и payload не менялись.

### PR #329 — review передачи юристу

Dialog открывается только при непустом списке препятствий.

- показывается весь список из блока «Перед передачей юристу»;
- показываются последствия и demo warning;
- Escape/Cancel без mutation и с focus return;
- server error повторно разрешает кнопку;
- при состоянии «можно передавать» базовый прямой handler остаётся нетронутым;
- используется существующий status RPC с состоянием `need_lawyer`.

Финальный head: `58ad1ebcc522822cd8fd34168a2ca03c0f82970e`.

PASS:

- 17/17 workflows;
- 10 dedicated desktop/mobile scenarios;
- exact status payload;
- ready-state direct action;
- предыдущие risk/document/form/async/focus contracts;
- review threads: 0.

Первый browser run упал только из-за неоднозначного тестового locator: исходная кнопка и confirm-кнопка имели одинаковый текст. Product runtime был корректен; финальный spec ограничивает поиск открытым dialog.

### PR #330 — полный аудит

Добавлены:

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md`;
- `docs/NAV_V2_TECHNICAL_AUDIT_2026-07-15.md`;
- `docs/NAV_V2_LEGAL_COMPLIANCE_AUDIT_2026-07-15.md`.

Аудит является обзором и планом. Он не отменяет ручные ограничения и не разрешает production mutations.

### PR #331 — live feedback трёх dialog-flow

Cross-flow recovery audit выявил общий пробел: после закрытия dialog текст mutation выводился в `#pageStatus`, но busy/error не имели гарантированной live-region семантики.

Добавлен `assets/js/nav-v2/page-action-feedback-v2.js`.

Контракт:

- busy: polite status, atomic, busy=true;
- success: polite status, busy=false;
- error: assertive alert, busy=false;
- один существующий `#pageStatus`;
- без focus jump;
- без дополнительных live regions.

Интегрированы:

1. risk resolution;
2. document problem;
3. lawyer handoff.

Существующие RPC и payload не менялись. Helper не содержит RPC, storage, collector, transport или observer. HTML entry-module budget не увеличен. Active hook release: `20260715-22`.

Финальный head: `c50ad80f06c5b190864ba03e7d4e9bcc3e239796`.

PASS:

- 18/18 workflows;
- full static suite;
- desktop/mobile live-region regression;
- busy/success/error/idle transitions;
- один status node после повторных переходов;
- dialog, form, focus, screen structure и mobile regressions;
- public desktop/mobile smoke;
- review threads: 0.

Authenticated browser workflow завершился успешно на public job, но authenticated job был пропущен. Это не authenticated evidence.

## Post-merge source smoke

`main` подтверждает:

- один shared helper управляет live semantics `#pageStatus`;
- три dialog-модуля импортируют helper;
- active module versions — `v02`;
- hook release — `20260715-22`;
- каждый flow сохраняет прежний RPC и payload;
- helper не меняет focus и не создаёт новые status nodes;
- backend и рабочие данные не менялись.

## Последний read-only baseline

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118.

Counts могут изменяться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Ручные ограничения

- По issue #273 нет решения владельца: duplicate cleanup запрещён.
- Для operational pilot не предоставлен полный evidence-пакет: pilot mutation запрещена.
- Для responsibility correction нет evidence: не менять ответственных в рабочих строках.
- Production-readonly workflow с запретом drift не запускался вручную.
- Для isolated authenticated E2E требуется отдельное явное решение; до него среду не создавать.

## Следующий безопасный продуктовый slice

P1 UX — task permission/action feedback и завершение task-flow.

Цель:

`нажать действие задачи → понять права → получить доступное состояние проверки/сохранения → увидеть результат или понятную ошибку`

Требования:

1. Проверить `task-action-guard-v2.js`, task buttons и completion evidence.
2. Не дублировать permission/RPC логику.
3. Переиспользовать `page-action-feedback-v2.js` для permission check и task mutation busy/success/error.
4. Сохранить текущие роли, status taxonomy и payload.
5. Проверить завершение и повторное открытие задачи; новый status не вводить без backend contract.
6. Permission error должен объяснять ответственного и не скрывать задачу.
7. Не создавать focus jump для pointer.
8. Новый observer не добавлять; существующий observer заменить explicit lifecycle только при доказанной эквивалентности.
9. Добавить source contract и desktop/mobile regression.
10. Без новых RPC, storage, collector, telemetry, backend или Supabase branch.

После этого выполнить read-only сверку task closure с техническим аудитом PR #330.

## Не повторять без новой причины

- общий аудит;
- action-first dashboard/list/card/manager;
- SPN rework и lawyer document lifecycle;
- mobile first screen;
- privacy/focus/async/landmark/form/choice foundation;
- risk dialog PR #325;
- document problem dialog PR #327;
- lawyer handoff dialog PR #329;
- dialog live feedback PR #331;
- production mutations без требуемых решений и evidence.

## Команда следующего запуска

`@GitHub продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #331. Начни task permission/action feedback slice: не дублируй permission или task RPC, переиспользуй page-action-feedback, проверь completion/reopen и сохрани роли, status taxonomy и payload. Без новых RPC, storage, collector, telemetry и backend.`
