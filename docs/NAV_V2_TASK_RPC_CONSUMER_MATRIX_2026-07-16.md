# Navigator v2 — task RPC consumer matrix v3

Дата: 17 июля 2026 года.

Статус: frontend authoritative integration gate v3. Рабочий frontend-handler интегрирован, bounded transport выключен, production Supabase не меняется.

## Итог

После PR #371–#377 подготовлены и проверены:

- controlled legacy review pack;
- bounded task taxonomy, mutations и PostgreSQL 17 harness;
- contract-aware lite DTO prototype;
- direct-link bounded UI preview;
- pure dual-path router;
- validated Edge action contract;
- dual-path browser contract;
- capture-phase authoritative handler rehearsal;
- отсутствие competing handler execution и сетевых bounded RPC в synthetic tests.

Текущий slice интегрирует dual-path router в рабочий `task-action-guard-v2.js`.

## Authoritative runtime handler

`assets/js/nav-v2/task-action-guard-v2.js` теперь:

- владеет task click в capture phase;
- вызывает `preventDefault()` и `stopImmediatePropagation()`;
- загружает role-scoped lite DTO;
- нормализует legacy и bounded permissions;
- преобразует старые `data-task-status` в действия `start`, `complete`, `reopen`;
- использует `taskActionRoutePreview()` как единственный route selector;
- вызывает сеть только для legacy route;
- очищает `button.onclick` после permission load;
- сохраняет cold-first-click без повторного нажатия;
- не создаёт дополнительный MutationObserver;
- не использует storage, telemetry или свободные данные клиента.

Legacy payload не меняется:

```text
nav_v2_update_task_status({ p_task_id, p_status })
```

## Bounded transport выключен

Для contract-v2 задачи handler может:

- распознать task action;
- проверить permission;
- проверить evidence/client-request UUID через router/adapter;
- отклонить bounded reopen;
- показать понятное сообщение о deployment gate.

Handler не вызывает:

- `nav_v2_start_bounded_task`;
- `nav_v2_complete_bounded_task`;
- active outcome RPC;
- terminal proposal/decision RPC.

`BOUNDED_TRANSPORT_ENABLED = false` остаётся жёстким source gate.

## Dormant base source

`assets/js/nav-v2/deal-card-v2.js` пока содержит старый `onclick` и literal `nav_v2_update_task_status`.

Он не может выполнить mutation, потому что authoritative capture-handler:

1. получает click раньше target `onclick`;
2. останавливает propagation;
3. после permission load очищает `button.onclick`;
4. выполняет ровно один route.

Source физически ещё не удалён. Это отдельный оставшийся cleanup blocker, а не скрытый runtime consumer.

## Runtime consumers

### Активные

1. `task-action-guard-v2.js` — frontend authoritative capture-handler;
2. `nav-v2-deal-api/index.ts` — legacy Edge action facade.

### Dormant source

- `deal-card-v2.js` — старый base `onclick`, выполнение подавлено и покрыто browser counters.

### Detached contracts/previews

- `task-action-router-v2.js`;
- `bounded-task-ui-preview-v2.js`;
- `task-action-contract-v2.js`.

Активных runtime consumers `nav_v2_add_task` нет.

## Browser regression

Desktop и mobile fixture проверяют:

- cold first click;
- permission denial;
- permission read failure;
- legacy mutation error;
- legacy complete/reopen;
- `baseTaskHandlerCalls = 0`;
- bounded completion route;
- отсутствие bounded network mutation;
- disabled bounded reopen.

Synthetic rehearsal PR #377 отдельно доказал:

- authoritative calls: 8;
- base listener calls: 0;
- guard competitor calls: 0;
- network RPC calls: 0.

## Закрытые blockers

- `lite_dto_contract_fields_missing`;
- `evidence_input_missing`;
- `reopen_semantics_undefined`;
- `governed_action_validation_missing`;
- `dual_path_browser_contract_missing`;
- `authoritative_handler_not_integrated`;
- `duplicate_handler_execution_risk`.

## Оставшиеся blockers

- `dormant_base_handler_source_not_removed`;
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

1. удалить dormant task mutation source из `deal-card-v2.js` отдельным точным source-cleanup;
2. провести authenticated application E2E после approval среды;
3. подготовить отдельный database deploy PR с объединёнными migrations и minimal grants;
4. интегрировать Edge actions только после database deployment;
5. включить bounded transport только для controlled pilot.

## Rollback

Frontend rollback:

- вернуть предыдущий `task-action-guard-v2.js`;
- вернуть старые fixture/source contracts.

Database rollback не требуется: production Supabase в этом slice не меняется.
