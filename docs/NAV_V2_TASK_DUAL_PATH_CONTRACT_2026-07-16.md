# Navigator v2 — dual-path task action contract

Дата: 16 июля 2026 года.

Статус: `repository-only dual-path gate`.

## Цель

Подготовить один authoritative handler, который после deployment сможет безопасно выбрать маршрут:

- legacy task → `nav_v2_update_task_status`;
- contract-v2 task → governed start, complete или outcome RPC.

Текущие рабочие файлы карточки и Edge Function не импортируют новый router. Transport остаётся выключенным.

## Router

`assets/js/nav-v2/task-action-router-v2.js` принимает DTO задачи, действие, bounded input и permissions из lite DTO.

Он возвращает ровно один `rpc_preview` либо явную ошибку.

Гарантии:

- `transport_enabled=false`;
- `runtime_integrated=false`;
- `duplicate_handler_allowed=false`;
- сеть, Supabase client, DOM и storage не используются.

## Legacy path

Legacy row определяется отсутствием `task_contract_version = 2`.

Разрешённые действия:

- `start` → `in_progress`;
- `complete` → `done`;
- `reopen` → `open`.

Маршрут доступен только при `can_change_status=true`. Это временный coexistence path для существующих 98 production-задач. Массовый backfill не выполняется.

## Bounded path

Contract-v2 row использует отдельные permissions:

- `can_start`;
- `can_complete`;
- `can_set_active_outcome`;
- `can_propose_terminal_outcome`;
- `can_decide_terminal_outcome`.

Router выбирает только governed RPC для start, completion с evidence UUID, active outcome, terminal proposal или terminal decision.

Bounded reopen запрещён. Завершённая задача неизменяема; новое действие создаётся новой audited bounded-задачей.

## Edge action contract

`supabase/functions/nav-v2-deal-api/task-action-contract-v2.js` описывает будущие Edge actions и точные payload allowlists.

Он проверяет UUID, enum values, review date, replacement task, unknown fields и запрет legacy action для contract-v2 payload.

Файл не импортирован в deployed Edge Function и не вызывает RPC.

## Synthetic browser regression

Fixture и Playwright test доказывают:

- legacy complete выбирает старый RPC;
- bounded complete выбирает governed RPC и передаёт evidence UUID;
- bounded reopen возвращает ошибку без RPC;
- waiting external выбирает active-outcome RPC;
- manager decision выбирает terminal-decision RPC;
- пять кликов дают пять router calls;
- сетевых `/rest/v1/rpc/` запросов нет.

## Что уже закрыто

- repository lite DTO содержит bounded contract/permission fields;
- direct-link UI preview показывает evidence, waits и terminal outcomes;
- reopen semantics определена как immutable + new audited task;
- pure bounded server adapter готов;
- dual-path router и Edge validation contract готовы.

## Что ещё блокирует deployment

- router не интегрирован в `task-action-guard-v2.js`;
- base handler карточки ещё содержит конкурирующий legacy listener;
- Edge Function actions не подключены к `index.ts`;
- database migrations и minimal grants не применены;
- authenticated application E2E отсутствует;
- frontend transport выключен;
- controlled pilot не утверждён.

## Separation

Этот slice не меняет runtime handlers, не деплоит Edge Function, не применяет SQL, не меняет grants/RLS/Auth/status guards, не меняет строки задач и не добавляет route/menu.

## Production gate

Deployment разрешён только после интеграции одного authoritative handler, удаления гонки с base listener, подключения validated Edge actions после database deployment, authenticated dual-path E2E, minimal grants, security advisors и controlled pilot.

## Rollback

Удалить repository-only router, Edge contract, fixtures, tests, workflow и документ. Runtime и production state не изменятся.
