# Navigator v2 — task action pipeline rehearsal

Дата: 17 июля 2026 года.

Статус: cost-free transport-free pipeline rehearsal. Production Supabase и deployed Edge Function не меняются.

## Цель

Связать уже готовые repository contracts в одну проверяемую цепочку:

`task DTO + user action → frontend router → canonical Edge action/payload → detached Edge validator → database p_* args → exact RPC parity`

Pipeline выдаёт только preview. Сеть, persistence и deployment выключены.

## Компоненты

### Frontend router

`assets/js/nav-v2/task-action-router-v2.js`:

- разделяет legacy и contract-v2 rows;
- проверяет DTO permission;
- требует evidence для bounded completion;
- требует review date для waiting/deferred;
- запрещает bounded reopen;
- формирует exact frontend RPC preview.

### Canonical pipeline

`assets/js/nav-v2/task-action-edge-pipeline-v2.js`:

- сопоставляет RPC с одним Edge action;
- переводит frontend `p_*` args в canonical Edge payload;
- добавляет `task_contract_version=2` для governed actions;
- вызывает detached Edge validator;
- переводит validated payload обратно в database `p_*` args;
- сравнивает RPC name и args с frontend preview;
- возвращает один validated RPC preview только при полном совпадении.

### Detached Edge validator

`supabase/functions/nav-v2-deal-api/task-action-contract-v2.js` остаётся не подключённым к deployed `index.ts`.

Он проверяет:

- known action;
- required fields;
- unknown fields;
- UUID fields;
- status/outcome/decision enums;
- reason code для конкретного active или terminal outcome;
- реальную календарную дату `YYYY-MM-DD`;
- replacement rules;
- запрет legacy action для contract-v2 row;
- запрет governed action для legacy row.

## Canonical mappings

- `nav_v2_update_task_status` → `legacy_update_task_status`;
- `nav_v2_start_bounded_task` → `bounded_task_start`;
- `nav_v2_complete_bounded_task` → `bounded_task_complete`;
- `nav_v2_set_bounded_task_active_outcome` → `bounded_task_active_outcome`;
- `nav_v2_propose_bounded_task_terminal_outcome` → `bounded_task_terminal_proposal`;
- `nav_v2_decide_bounded_task_terminal_outcome` → `bounded_task_terminal_decision`.

## Valid scenarios

Semantic runner проверяет:

- legacy completion;
- bounded start;
- bounded completion с evidence;
- waiting external;
- deferred;
- proposals `not_applicable`, `replaced`, `cancelled`;
- terminal decision `confirm`, `reject`.

Для каждого сценария требуется:

- `stage=validated_rpc_preview`;
- один Edge action;
- exact RPC name;
- exact database args;
- frontend/Edge parity;
- `network_called=false`;
- `transport_enabled=false`;
- `runtime_integrated=false`;
- `edge_deployed=false`.

## Rejected/tampered scenarios

Проверяются:

- bounded reopen;
- completion без evidence;
- unknown client field;
- invalid task UUID;
- reason code от другого outcome;
- невозможная календарная дата;
- replacement на ту же задачу;
- подмена `task_contract_version`;
- legacy action для bounded row;
- governed action для legacy row.

Ни один rejected case не получает validated RPC preview.

## Browser rehearsal

Desktop и mobile Chromium проверяют:

- один click → один validated RPC preview;
- exact RPC names для legacy/complete/waiting/replaced/decision;
- bounded reopen останавливается на frontend router;
- tampered payload останавливается на Edge validation;
- несколько последовательных действий не создают hidden transport;
- `/rest/v1/rpc/` network calls остаются пустыми.

## Что не доказывает

Pipeline rehearsal не доказывает:

- реальный Supabase Auth;
- JWT claims;
- RLS;
- database grants;
- существование governed RPC в production;
- deployed Edge authorization;
- production persistence;
- корректность реальных назначений сотрудников.

Skipped authenticated workflow и этот mocked pipeline нельзя называть deployment evidence.

## Production boundary

Не выполняются:

- Supabase branch creation;
- production SQL;
- migrations;
- Auth/RLS/grants changes;
- Edge Function deployment;
- frontend bounded transport switch;
- task-row changes;
- mass backfill;
- employee evaluation.

Issue #282 продолжает запрещать платную preview branch без нового explicit approval.

## Следующий gate

После зелёного rehearsal:

1. реальный authenticated application E2E остаётся deferred по Issue #282;
2. database deploy PR можно только подготовить repository-only, не применять;
3. Edge action integration — только после database deployment approval;
4. bounded transport — только controlled pilot после Auth/RLS/grants evidence.

## Rollback

Repository rollback:

- удалить pipeline module;
- вернуть предыдущий detached Edge validator;
- вернуть dual-path fixtures;
- удалить semantic/browser scenarios, checker, workflow и этот документ.

Production rollback не требуется: production state не меняется.
