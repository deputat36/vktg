# Navigator v2 — task RPC consumer matrix v4

Дата: 17 июля 2026 года.

Статус: frontend authoritative single-source gate v4. Рабочий frontend-handler единственный, bounded transport выключен, production Supabase не меняется.

## Итог

После PR #371–#378 подготовлены и проверены:

- controlled legacy review pack;
- bounded task taxonomy, governed mutations и PostgreSQL 17 harness;
- contract-aware lite DTO prototype;
- direct-link bounded UI preview;
- pure dual-path router;
- validated Edge action contract;
- dual-path browser contract;
- capture-phase authoritative handler rehearsal;
- рабочая интеграция authoritative handler с bounded transport off.

Текущий source cleanup удаляет последний dormant mutation path из `deal-card-v2.js`.

## Authoritative runtime handler

`assets/js/nav-v2/task-action-guard-v2.js`:

- владеет task click в capture phase;
- вызывает `preventDefault()` и `stopImmediatePropagation()`;
- загружает role-scoped lite DTO;
- нормализует legacy и bounded permissions;
- преобразует старые `data-task-status` в `start`, `complete`, `reopen`;
- использует `taskActionRoutePreview()` как единственный route selector;
- вызывает сеть только для legacy route;
- сохраняет cold-first-click без повторного нажатия;
- не создаёт дополнительный MutationObserver;
- не использует storage, telemetry или свободные данные клиента.

Legacy payload не меняется:

```text
nav_v2_update_task_status({ p_task_id, p_status })
```

## Source cleanup

Из `assets/js/nav-v2/deal-card-v2.js` удалены:

- base `document.querySelectorAll('[data-task-id]')` mutation listener;
- direct literal `nav_v2_update_task_status`;
- base success/error feedback для task mutation.

Сохранены:

- `taskActions(task)`;
- legacy buttons `data-task-status="in_progress|done|open"`;
- task titles, descriptions, priority, status и role rendering;
- остальные document, deal status, legal action и comment handlers.

Dormant source отсутствует. Карточка только рендерит task controls; действия выполняет один authoritative frontend source.

## Runtime consumers

### Активные

1. `assets/js/nav-v2/task-action-guard-v2.js` — frontend authoritative capture-handler;
2. `supabase/functions/nav-v2-deal-api/index.ts` — legacy Edge action facade.

### Detached contracts/previews

- `assets/js/nav-v2/task-action-router-v2.js`;
- `assets/js/nav-v2/bounded-task-ui-preview-v2.js`;
- `supabase/functions/nav-v2-deal-api/task-action-contract-v2.js`.

Активных runtime consumers `nav_v2_add_task` нет.

## Bounded transport выключен

Для contract-v2 задачи handler может:

- распознать task action;
- проверить permission;
- проверить evidence/client-request UUID через router/adapter;
- отклонить bounded reopen;
- показать понятное сообщение о deployment gate.

Handler не вызывает governed bounded RPC. `BOUNDED_TRANSPORT_ENABLED = false` остаётся жёстким source gate.

## Browser regression

Desktop и mobile fixture проверяют:

- cold first click;
- permission denial и permission read failure;
- legacy mutation success/error;
- legacy complete/reopen;
- synthetic `baseTaskHandlerCalls = 0`;
- bounded completion route;
- отсутствие bounded network mutation;
- disabled bounded reopen.

Synthetic base `onclick` остаётся только в test fixture как regression trap. В production card source его больше нет.

## Закрытые blockers

- `lite_dto_contract_fields_missing`;
- `evidence_input_missing`;
- `reopen_semantics_undefined`;
- `governed_action_validation_missing`;
- `dual_path_browser_contract_missing`;
- `authoritative_handler_not_integrated`;
- `duplicate_handler_execution_risk`;
- `dormant_base_handler_source_not_removed`.

## Оставшиеся blockers

- `edge_actions_not_integrated`;
- `database_migrations_not_deployed`;
- `minimal_grants_not_deployed`;
- `authenticated_application_e2e_missing`;
- `frontend_bounded_transport_disabled`;
- `controlled_pilot_not_approved`.

## Production gate

Production Supabase не получает:

- bounded columns;
- mutation event table;
- governed RPC;
- новые grants/RLS;
- Edge Function deployment;
- изменения task rows.

Deployment bounded transport запрещён, пока `deployment_ready=false`.

98 legacy tasks продолжают работать через старый RPC без массового backfill. Review и pilot metrics нельзя использовать для оценки сотрудников.

## Следующий safe slice

1. authenticated application E2E после approval среды;
2. отдельный database deploy PR с объединёнными migrations и minimal grants;
3. Edge action integration/deployment после database deployment;
4. controlled frontend bounded transport switch;
5. controlled pilot;
6. security hardening.

## Rollback

Frontend rollback:

- вернуть удалённый base listener только вместе с откатом PR #378;
- вернуть matrix/checkers v3.

Database rollback не требуется: production Supabase в этом slice не меняется.
