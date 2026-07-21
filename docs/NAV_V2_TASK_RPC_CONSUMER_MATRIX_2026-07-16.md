# Navigator v2 — task RPC consumer matrix v5

Дата обновления: 21 июля 2026 года.

Статус: frontend authoritative + Edge candidate integrated, transport disabled. Рабочий frontend-handler остаётся единственным активным источником действий в браузере. Candidate Edge entrypoint содержит governed route за выключенным feature flag. Production Supabase и развёрнутая Edge Function не изменены.

## Итог

Подготовлены и проверены:

- bounded task taxonomy, mutations и PostgreSQL 17 harness;
- contract-aware lite DTO prototype;
- pure dual-path router;
- authoritative frontend handler;
- физическое удаление dormant base mutation source;
- task action pipeline с exact frontend/Edge RPC parity;
- verified actor identity, active-profile и assignment preflight;
- repository-only Candidate Edge entrypoint;
- неизменяемый Production Edge snapshot фактически развёрнутой версии v4.

## Authoritative frontend

`assets/js/nav-v2/task-action-guard-v2.js`:

- владеет task click в capture phase;
- загружает role-scoped lite DTO;
- использует `taskActionRoutePreview()` как единственный route selector;
- вызывает сеть только для legacy route;
- сохраняет exact legacy payload;
- блокирует bounded network transport;
- не содержит service-role transport.

Legacy payload:

```text
nav_v2_update_task_status({ p_task_id, p_status })
```

`BOUNDED_TRANSPORT_ENABLED = false` остаётся обязательным frontend gate.

## Source cleanup

В `deal-card-v2.js` отсутствуют:

- base task mutation listener;
- direct `nav_v2_update_task_status` call;
- base task success/error mutation path.

Task rendering и legacy button attributes сохранены. Dormant mutation source отсутствует.

## Production Edge snapshot

`supabase/functions/nav-v2-deal-api/index.production-v4.ts` — точный неизменяемый снимок развёрнутой Edge Function `nav-v2-deal-api` версии 4.

Он:

- остаётся legacy-only;
- содержит только `update_task_status` для задач;
- не содержит governed bounded actions;
- не содержит service-role task context transport;
- используется release-drift baseline;
- не является новым deploy artifact.

Release baseline сравнивает production с этим снимком, а не с недеплоенным candidate source.

## Candidate Edge entrypoint

`supabase/functions/nav-v2-deal-api/index.ts` — repository-only Candidate Edge entrypoint.

В нём source-integrated:

- bounded task action inventory;
- verified Auth user id;
- active `nav_user_profiles` lookup;
- contract-v2 task context lookup;
- role и assignment preflight;
- broker mortgage-only scope;
- actor-aware RPC argument `p_actor_id`.

Ограничения:

```text
BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false
edge_deployed = false
actor_aware_sql_deployed = false
frontend_transport_enabled = false
```

Candidate source не считается production runtime и не меняет live Edge Function.

## Runtime consumers

### Фактически активные

1. `assets/js/nav-v2/task-action-guard-v2.js` — authoritative frontend capture-handler.
2. `supabase/functions/nav-v2-deal-api/index.production-v4.ts` — release snapshot развёрнутого legacy Edge facade.

### Repository candidate

1. `supabase/functions/nav-v2-deal-api/index.ts` — governed actions source-integrated, feature disabled, not deployed.
2. `supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js` — dependency-injected role/assignment runtime adapter.

### Test and contract sources

- `assets/js/nav-v2/task-action-router-v2.js`;
- `assets/js/nav-v2/task-action-edge-pipeline-v2.js`;
- `assets/js/nav-v2/bounded-task-ui-preview-v2.js`;
- `supabase/functions/nav-v2-deal-api/task-action-contract-v2.js`;
- desktop/mobile synthetic regressions.

Активных runtime consumers `nav_v2_add_task` нет.

## Task action pipeline

Pipeline связывает:

`frontend router → canonical action/payload → Edge validator → p_* RPC args`

Он требует:

- один action → один validated RPC preview;
- exact RPC name и args parity;
- contract-v2 guard;
- запрет legacy action для bounded row;
- unknown-field, UUID, reason, date и replacement validation;
- `network_called=false`;
- `transport_enabled=false`.

Pipeline остаётся test/contract consumer, а не production network path.

## Browser regression

Desktop/mobile evidence покрывает:

- cold first click;
- permission denial/read failure;
- legacy success/error/complete/reopen;
- competing onclick counter = 0;
- bounded no-network и disabled reopen;
- mocked role matrix;
- exact pipeline previews;
- tampered actor/payload rejection.

## Закрытые blockers

- `lite_dto_contract_fields_missing`;
- `evidence_input_missing`;
- `reopen_semantics_undefined`;
- `governed_action_validation_missing`;
- `dual_path_browser_contract_missing`;
- `authoritative_handler_not_integrated`;
- `duplicate_handler_execution_risk`;
- `dormant_base_handler_source_not_removed`;
- `frontend_edge_rpc_parity_missing`;
- `edge_actions_not_integrated`.

Последний blocker закрыт только на уровне repository source integration. Это не означает deploy или production readiness.

## Оставшиеся blockers

- `edge_runtime_feature_flag_disabled`;
- `edge_function_not_deployed`;
- `database_migrations_not_deployed`;
- `minimal_grants_not_deployed`;
- `authenticated_application_e2e_missing`;
- `frontend_bounded_transport_disabled`;
- `controlled_pilot_not_approved`.

## Production gate

Production Supabase сейчас не содержит:

- `task_contract_version`;
- actor-aware bounded task RPC overloads;
- governed task event layer;
- новые grants/RLS;
- candidate Edge deployment;
- bounded frontend transport.

Live read-only проверка 21 июля 2026 года подтвердила 88 открытых и 10 отменённых legacy-задач, без `in_progress` и `done`.

Перед production:

1. отдельное подтверждение стоимости preview branch;
2. synthetic preview environment без production data;
3. preview database migrations и минимальные grants;
4. candidate Edge deploy только в preview;
5. authenticated role/mutation E2E;
6. отдельное production approval;
7. database-first deploy;
8. Edge deploy с feature flag disabled;
9. controlled frontend switch и пилот.

## Rollback

Repository rollback:

- удалить candidate Edge integration;
- вернуть consumer matrix v4;
- удалить `index.production-v4.ts` только одновременно с возвратом release baseline к фактическому live source;
- сохранить production `index.ts` source snapshot и release-drift evidence.

Production rollback не требуется: migration, Edge deployment, Auth, RLS, grants и production rows не изменялись.
