# Navigator v2 — dual-path task action contract v2

Дата обновления: 17 июля 2026 года.

Статус: frontend router integrated, Edge detached. Legacy runtime работает, bounded transport выключен.

## Цель

Один authoritative frontend handler безопасно выбирает маршрут:

- legacy task → `nav_v2_update_task_status`;
- contract-v2 task → governed start, complete или outcome RPC preview.

Router уже подключён только к `task-action-guard-v2.js`. Detached Edge validator и parity pipeline не подключены к deployed `index.ts`.

## Authoritative frontend

`assets/js/nav-v2/task-action-guard-v2.js`:

- владеет task click в capture phase;
- загружает role-scoped lite DTO;
- вызывает pure `taskActionRoutePreview()`;
- выполняет legacy RPC с прежним payload;
- блокирует bounded network transport;
- не импортирует detached Edge validator или pipeline.

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

`supabase/functions/nav-v2-deal-api/task-action-contract-v2.js` остаётся detached и transport-free.

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

Файл не импортирован в deployed Edge Function и не вызывает RPC.

## Pipeline rehearsal

`task-action-edge-pipeline-v2.js` связывает frontend router и detached Edge validator:

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

Отдельный pipeline browser regression проверяет exact frontend/Edge parity и tampered payload rejection.

## Закрытые blockers

- authoritative router integrated;
- duplicate frontend handlers removed;
- frontend/Edge RPC parity contract added.

## Что ещё блокирует deployment

- Edge actions не подключены к deployed `index.ts`;
- database migrations и minimal grants не применены;
- настоящий authenticated application E2E отсутствует;
- frontend bounded transport выключен;
- controlled pilot не утверждён.

Issue #282 запрещает платную preview branch без нового explicit approval.

## Production gate

Deployment разрешён только после отдельного database/Edge approval, реального Auth/RLS/grants evidence и controlled pilot.

Этот contract не применяет SQL, не меняет Auth/RLS/grants/status guards, не меняет строки задач и не добавляет route/menu.

## Rollback

Repository rollback:

- вернуть dual-path contract v1;
- удалить parity pipeline artifacts;
- вернуть предыдущий detached Edge validator и fixtures.

Production rollback не требуется: production state не меняется.
