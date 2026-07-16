# Navigator v2 — task RPC consumer matrix

Дата: 16 июля 2026 года.

Статус: repository-only deployment gate. Runtime-код и production Supabase не меняются.

## Итог

Bounded-task database contract и transport-free adapter готовы, но frontend ещё не готов к deployment.

Старые RPC:

- `nav_v2_add_task`;
- `nav_v2_update_task_status`.

## nav_v2_add_task

Активных runtime consumers в `assets/js/nav-v2` и Edge Functions не найдено.

RPC остаётся в `config/nav-v2-rpc-surface.json` и historical SQL/security inventory. После deployment governed create transport его нужно удалить из `frontend_api`, но это не основной blocker текущего UI.

## nav_v2_update_task_status

### `assets/js/nav-v2/deal-card-v2.js`

Карточка сделки напрямую вызывает старый RPC и показывает три кнопки:

- `in_progress`;
- `done`;
- `open`.

Для contract-v2 задач прямой вызов недопустим:

- `done` требует evidence UUID;
- `open` после завершения не имеет утверждённой governed semantics;
- active waits должны отображаться как явные `waiting_external`, `deferred` и Resume.

### `assets/js/nav-v2/task-action-guard-v2.js`

Guard перехватывает те же кнопки, выполняет permission read через lite DTO и сам вызывает `nav_v2_update_task_status`.

Это фактически основной handler. Перед migration он должен получить `task_contract_version` и governed permissions из lite DTO, затем разделить:

- legacy row → старый status RPC;
- contract-v2 row → start/complete/outcome RPC.

Base handler карточки не должен конкурировать с guard.

### `supabase/functions/nav-v2-deal-api/index.ts`

Edge Function имеет action `update_task_status` и проксирует старый RPC.

Его нельзя переключать раньше database deployment. Нужны отдельные governed actions с точной UUID/enum/date validation. Legacy action должен явно отклонять contract-v2 rows.

## Lite DTO blocker

Текущий `nav_v2_get_deal_card_lite` task DTO возвращает только:

- id;
- title;
- status;
- priority;
- assigned role;
- due date;
- `can_change_status`.

Для contract-aware UI нужны:

- contract version и task type;
- evidence kind и criterion;
- gate scope;
- outcome code/state/review date;
- отдельные permissions start/complete/active outcome/proposal/decision.

Пока этих полей нет, guard не может безопасно выбрать mutation route.

## Test consumers

Старый payload закреплён в:

- `tests/e2e/task-action-feedback.spec.js`;
- `scripts/check_nav_v2_task_action_feedback.py`;
- `tests/fixtures/nav-v2-task-action-feedback.html`.

E2E отдельно требует completion и reopen через один старый RPC. Этот контракт должен быть заменён на dual-path tests:

- legacy status path;
- bounded start path;
- bounded completion с evidence;
- active waits;
- terminal proposal/decision;
- отсутствие duplicate handlers.

## Не готов к deployment

Обязательные решения:

1. evidence picker/reference для кнопки «Готово»;
2. semantics reopen completed task;
3. явные Waiting external / Deferred / Resume controls;
4. расширение lite DTO;
5. один authoritative click handler;
6. новые Edge Function actions;
7. обновлённые browser/source tests;
8. coexistence с 98 legacy rows без mass backfill.

## Deployment order

1. repository-only lite DTO extension;
2. contract-aware UI preview;
3. dual-path E2E;
4. authenticated application E2E;
5. database migrations и minimal grants;
6. Edge Function deployment;
7. frontend transport switch;
8. controlled pilot;
9. удаление legacy inventory только при нуле runtime consumers.

## Production gate

Deployment запрещён, пока matrix имеет `deployment_ready=false` или checker находит неучтённый runtime consumer.

Skipped authenticated job не считается доказательством. Review pack и consumer matrix не используются для оценки сотрудников.

## Rollback

Этот slice меняет только matrix, checker, workflow и документацию. Rollback — удалить эти repository artifacts. Runtime и database state не затрагиваются.
