# Navigator v2 — dual-path task action contract v3

Дата обновления: 21 июля 2026 года.

Статус: frontend router and Edge source integrated, transport disabled. Legacy runtime работает по умолчанию; оба bounded feature flags выключены.

## Цель

Один authoritative frontend handler безопасно выбирает маршрут:

- legacy task → `nav_v2_update_task_status`;
- contract-v2 task → governed start, complete или outcome preview.

Frontend router подключён только к `task-action-guard-v2.js`. Edge source route подключён к `index.ts`, но `BOUNDED_TASK_EDGE_IDENTITY_ENABLED=false`, поэтому bounded Edge path не выполняет profile/task/RPC transport.

## Authoritative frontend

`assets/js/nav-v2/task-action-guard-v2.js`:

- владеет task click в capture phase;
- загружает role-scoped lite DTO;
- вызывает pure `taskActionRoutePreview()`;
- выполняет legacy RPC с прежним payload;
- содержит `BOUNDED_TRANSPORT_ENABLED=false`;
- не импортирует Edge validator, identity handler или runtime adapter.

`deal-card-v2.js` только рендерит task controls и не содержит mutation listener.

## Router

`assets/js/nav-v2/task-action-router-v2.js` остаётся pure:

- не использует сеть, Supabase client, DOM или storage;
- возвращает один `rpc_preview` либо ошибку;
- сохраняет `duplicate_handler_allowed=false`;
- не включает transport.

## Legacy path

Legacy row определяется отсутствием `task_contract_version=2`.

- `start` → `in_progress`;
- `complete` → `done`;
- `reopen` → `open`.

Маршрут доступен только при `can_change_status=true`. Существующие 98 production-задач не backfill-ятся.

## Bounded path

Contract-v2 row использует permissions:

- `can_start`;
- `can_complete`;
- `can_set_active_outcome`;
- `can_propose_terminal_outcome`;
- `can_decide_terminal_outcome`.

Router формирует governed RPC preview для start, completion с evidence UUID, active outcome, terminal proposal или terminal decision.

Bounded reopen запрещён. Завершённая задача неизменяема; новая работа создаётся новой audited bounded-задачей.

## Edge action contract

`supabase/functions/nav-v2-deal-api/task-action-contract-v2.js` остаётся transport-free pure validator.

Он проверяет:

- action allowlist;
- required и unknown fields;
- UUID;
- status/outcome/decision enums;
- outcome-specific reason codes;
- реальную календарную review date;
- replacement rules;
- запрет legacy action для contract-v2 row;
- запрет governed action для legacy row.

Файл не вызывает сеть или RPC. Он используется через identity/runtime source chain.

## Edge runtime adapter

`task-action-edge-runtime-v2.js` подключён к `index.ts` и остаётся dependency-injected pure adapter.

Он:

- принимает только verified Auth user id;
- запрещает client actor/role fields;
- проверяет active `nav_user_profiles` profile;
- проверяет contract-v2 task context;
- применяет role и assignment preflight;
- ограничивает broker только `broker_task` с mortgage/military-mortgage source;
- добавляет verified actor как `p_actor_id`;
- выполняет ровно один actor-aware RPC через внедрённый server client;
- не содержит `Deno.env`, network fetch или secret access.

`index.ts` владеет service-side transport, но bounded route выключен константой:

`const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;`

При выключенном флаге profile/task/RPC clients не вызываются.

Service-role key допускается только как Edge secret и не может попадать во frontend, response или log.

## Pipeline rehearsal

`task-action-edge-pipeline-v2.js` остаётся отдельным frontend/validator rehearsal:

- переводит frontend `p_*` args в canonical Edge payload;
- валидирует payload;
- переводит его обратно в database args;
- требует exact RPC name/args parity;
- возвращает только preview;
- не вызывает сеть и не включает deployment.

## Synthetic browser regression

Dual-path fixture доказывает:

- legacy complete выбирает старый RPC;
- bounded complete выбирает governed preview с evidence UUID;
- bounded reopen возвращает ошибку;
- waiting external выбирает active-outcome preview;
- manager decision выбирает terminal-decision preview;
- сетевых `/rest/v1/rpc/` запросов нет.

Отдельный Edge runtime semantic matrix проверяет SPN, lawyer, broker mortgage-only и manager supervisor, а также inactive profile, viewer, role/assignment mismatch, contract-v1 и cross-actor RPC rejection.

## Закрытые blockers

- authoritative frontend router integrated;
- duplicate frontend handlers removed;
- frontend/Edge RPC parity contract added;
- Edge action source route integrated behind disabled flag.

## Что ещё блокирует deployment

- actor-aware database migrations и minimal grants не применены;
- Edge runtime feature flag выключен;
- Edge Function с этим source не деплоился;
- настоящий authenticated application E2E отсутствует;
- frontend bounded transport выключен;
- controlled pilot не утверждён.

Issue #282 запрещает платную preview branch без нового explicit approval.

## Production gate

Deployment разрешён только после отдельного database/Edge approval, реального Auth/RLS/grants evidence и controlled pilot.

Этот contract не применяет SQL, не меняет Auth/RLS/grants/status guards, не меняет строки задач и не добавляет route/menu.

## Rollback

Repository rollback:

- вернуть dual-path contract v2;
- удалить `task-action-edge-runtime-v2.js` и runtime integration config/tests;
- удалить bounded import/route из `index.ts`;
- вернуть Edge layer manifest в detached state.

Production rollback не требуется: feature flag выключен, Edge не деплоился, production state не меняется.
