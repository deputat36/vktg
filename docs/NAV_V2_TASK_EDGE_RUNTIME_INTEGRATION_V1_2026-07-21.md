# Navigator v2 — repository-only Edge identity runtime integration v1

Дата: 21 июля 2026 года.

## Статус

Edge identity/action route интегрирован только на уровне исходников.

- `runtime_source_integrated=true`;
- `feature_flag_default=false`;
- `actor_aware_sql_deployed=false`;
- `edge_deployed=false`;
- `frontend_transport_enabled=false`;
- `production_applied=false`.

Это не Edge deployment и не разрешение на включение bounded transport.

## Feature flag

В `supabase/functions/nav-v2-deal-api/index.ts` задано:

`const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;`

При выключенном флаге bounded action завершается на этапе `feature_disabled` до profile lookup, task lookup или actor-aware RPC.

Legacy actions и user-JWT RPC path остаются default runtime.

## Identity chain

Будущий включённый путь должен выполнять только следующую цепочку:

1. bearer user JWT;
2. успешный `/auth/v1/user` lookup;
3. verified Auth user UUID;
4. service-side active `nav_user_profiles` lookup по этому UUID;
5. service-side contract-v2 task context lookup;
6. role и assignment preflight;
7. ровно один actor-aware RPC с `p_actor_id=verified_user.id`.

Client body не может задавать:

- `actor_id`;
- `p_actor_id`;
- `user_id`;
- `p_user_id`;
- role или assignment authority.

## Runtime adapter

`task-action-edge-runtime-v2.js` остаётся pure dependency-injected module:

- не использует `Deno.env`;
- не вызывает `fetch`;
- не читает secrets;
- не пишет logs;
- использует existing action validator и detached identity handler;
- проверяет active profile и contract-v2 task;
- вызывает внедрённый RPC client только после всех gates.

Network, environment и service-role transport принадлежат только Edge `index.ts`.

## Service-side context

Profile lookup использует только:

- `id`;
- `role`;
- `is_active`.

Task lookup использует только:

- `id`;
- `assigned_to`;
- `assigned_role`;
- `task_type`;
- `source`;
- `task_contract_version`.

Production task table пока не содержит bounded contract columns. Route выключен до отдельного database deployment.

## Role policy

Supervisor roles:

- owner;
- admin;
- manager.

Они могут пройти Edge preflight для contract-v2 task, но database RPC всё равно остаётся authoritative.

Specialist roles:

- SPN;
- lawyer;
- broker.

Для specialist обязательны:

- совпадение `assigned_role` с profile role;
- совпадение `assigned_to` с verified actor, если `assigned_to` заполнен.

Viewer mutation запрещена.

## Broker scope

Broker допускается только когда одновременно:

- `assigned_role=broker`;
- `task_type=broker_task`;
- `source=intake_v1:mortgage` или `intake_v1:military_mortgage`.

Маткапитал, сертификаты, дети, опека и другие юридические сценарии не расширяют broker scope.

## Service-role secret boundary

`SUPABASE_SERVICE_ROLE_KEY` допускается только в Edge environment.

Запрещено:

- помещать key или env name во frontend assets;
- возвращать key в response;
- писать key в logs;
- передавать key клиенту;
- использовать client-supplied actor с service-role RPC.

Будущий Edge deployment обязан сохранять `verify_jwt=true`.

## Semantic matrix

Positive scenarios:

- SPN выполняет назначенную SPN task;
- lawyer выполняет назначенную lawyer task;
- broker выполняет mortgage broker task;
- manager проходит supervisor preflight.

Negative scenarios:

- feature disabled;
- invalid verified user UUID;
- client actor field;
- inactive profile;
- unsupported profile role;
- viewer mutation;
- specialist role mismatch;
- task assigned to another actor;
- broker wrong task type;
- broker non-mortgage source;
- contract-v1 task;
- actor-aware RPC rejection, включая cross-actor replay rejection.

Каждый rejection проверяет, что лишние profile/task/RPC calls не выполняются.

## Deployment gate

Source integration не закрывает следующие STOP:

- actor-aware SQL не развёрнут;
- executable migrations не утверждены;
- production rollback package не утверждён;
- Edge feature flag выключен;
- Edge Function не деплоился;
- authenticated role matrix не выполнен;
- frontend bounded transport выключен;
- deployment approval и pilot отсутствуют.

Issue #282 остаётся обязательным cost gate. Generic `продолжай` не является approval.

## Rollback

Repository rollback:

1. удалить import/runtime route из `index.ts`;
2. удалить `task-action-edge-runtime-v2.js`;
3. удалить runtime config, tests и workflow;
4. вернуть deployment manifest и dual-path contract в detached state.

Production rollback не требуется: feature flag выключен, Edge не деплоился, Supabase production не изменялся.
