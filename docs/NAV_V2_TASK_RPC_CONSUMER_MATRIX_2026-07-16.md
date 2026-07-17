# Navigator v2 — task RPC consumer matrix v4

Дата обновления: 17 июля 2026 года.

Статус: frontend authoritative single-source gate v4. Рабочий frontend-handler единственный, bounded transport выключен, production Supabase не меняется.

## Итог

Подготовлены и проверены:

- bounded task taxonomy, mutations и PostgreSQL 17 harness;
- controlled legacy review pack;
- contract-aware lite DTO prototype;
- bounded UI preview;
- pure dual-path router;
- authoritative frontend handler;
- физическое удаление dormant base mutation source;
- cost-free mocked role matrix;
- Task action pipeline с exact frontend/Edge RPC parity.

## Authoritative runtime handler

`assets/js/nav-v2/task-action-guard-v2.js`:

- владеет task click в capture phase;
- загружает role-scoped lite DTO;
- использует `taskActionRoutePreview()` как единственный route selector;
- преобразует legacy `data-task-status` в `start`, `complete`, `reopen`;
- вызывает сеть только для legacy route;
- сохраняет exact legacy payload;
- блокирует bounded network transport;
- не импортирует detached Edge validator или parity pipeline.

Legacy payload:

```text
nav_v2_update_task_status({ p_task_id, p_status })
```

## Source cleanup

В `deal-card-v2.js` отсутствуют:

- base task mutation listener;
- direct `nav_v2_update_task_status` literal;
- base task success/error mutation path.

Сохранены task rendering и legacy button attributes. Dormant source отсутствует.

## Runtime consumers

### Активные

1. `assets/js/nav-v2/task-action-guard-v2.js` — authoritative frontend capture-handler;
2. `supabase/functions/nav-v2-deal-api/index.ts` — deployed legacy Edge action facade.

### Detached contracts/previews

- `assets/js/nav-v2/task-action-router-v2.js`;
- `assets/js/nav-v2/task-action-edge-pipeline-v2.js`;
- `assets/js/nav-v2/bounded-task-ui-preview-v2.js`;
- `supabase/functions/nav-v2-deal-api/task-action-contract-v2.js`.

Активных runtime consumers `nav_v2_add_task` нет.

## Task action pipeline

Detached pipeline связывает:

`frontend router → canonical Edge action/payload → detached Edge validator → database p_* args`

Он требует:

- один action → один validated RPC preview;
- exact RPC name parity;
- exact args parity;
- contract-v2 guard для governed actions;
- запрет legacy action для bounded row;
- unknown-field, UUID, reason, date и replacement validation;
- `network_called=false`;
- `runtime_integrated=false`;
- `edge_deployed=false`;
- `transport_enabled=false`.

Pipeline является test/contract consumer, а не production runtime consumer.

## Bounded transport выключен

Для contract-v2 row frontend может распознать action, проверить DTO permission и UUID/evidence contract, но governed RPC не вызывается.

`BOUNDED_TRANSPORT_ENABLED = false` остаётся source gate.

## Browser regression

Desktop/mobile evidence покрывает:

- cold first click;
- permission denial/read failure;
- legacy success/error/complete/reopen;
- synthetic competing onclick counter = 0;
- bounded no-network и disabled reopen;
- mocked role matrix;
- exact pipeline previews;
- tampered Edge payload rejection;
- ноль `/rest/v1/rpc/` calls в pipeline rehearsal.

## Закрытые blockers

- `lite_dto_contract_fields_missing`;
- `evidence_input_missing`;
- `reopen_semantics_undefined`;
- `governed_action_validation_missing`;
- `dual_path_browser_contract_missing`;
- `authoritative_handler_not_integrated`;
- `duplicate_handler_execution_risk`;
- `dormant_base_handler_source_not_removed`;
- `frontend_edge_rpc_parity_missing`.

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
- Edge deployment;
- task-row changes;
- mass backfill.

Issue #282 запрещает платную preview branch без нового explicit approval. Mocked/skipped tests не считаются Auth/RLS/grants proof.

98 legacy tasks продолжают работать через старый RPC.

## Следующий safe slice

1. продолжать бесплатные repository/CI checks;
2. настоящий authenticated E2E — только после нового approval Issue #282;
3. repository-only database deployment bundle, без применения;
4. Edge integration только после database deployment approval;
5. controlled bounded transport switch;
6. controlled pilot;
7. security hardening.

## Rollback

Repository rollback:

- удалить pipeline artifacts;
- вернуть предыдущий detached Edge validator;
- вернуть consumer matrix/checkers без pipeline inventory.

Production rollback не требуется: production state не меняется.
