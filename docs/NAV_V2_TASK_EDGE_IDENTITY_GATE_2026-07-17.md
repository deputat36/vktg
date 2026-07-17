# Navigator v2 — task Edge identity and SQL parity gate

Дата: 17 июля 2026 года.

Статус: repository-only identity and SQL parity gate. Это не Edge integration, не deployment и не изменение production SQL.

## Текущий canonical конфликт

Canonical governed bounded-task RPC:

- используют `auth.uid()` как источник действующего пользователя;
- запрещают EXECUTE для `public`, `anon`, `authenticated`;
- разрешают EXECUTE только `service_role`.

Пользовательский JWT содержит actor identity, но роль `authenticated` не имеет EXECUTE. Service-role transport имеет EXECUTE, но пользовательский `sub` не гарантирован.

Canonical signatures без actor-aware overlay нельзя вызывать через Edge как доказуемую пользовательскую операцию.

## PR #387: identity propagation proof

PR #387 доказал этот конфликт в PostgreSQL 17 и установил trust boundary:

`bearer token → verified actor UUID → validated action → p_actor_id injection → service-role RPC`

Client payload не может задавать actor.

Запрещены поля:

- `actor_id`;
- `p_actor_id`;
- `user_id`;
- `p_user_id`.

Неизвестные top-level поля также отклоняются.

## PR #389: repository SQL resolution

PR #389 добавил repository-only actor-aware SQL overloads:

- сохраняются canonical RPC names;
- добавляется последний аргумент `p_actor_id`;
- overloads доступны только `service_role`;
- active Navigator profile проверяется в SQL;
- idempotent replay привязан к тому же actor;
- canonical lifecycle повторно проверяет роль, сделку, назначение, evidence и outcome;
- actor claim восстанавливается при успехе и ошибке;
- audit events сохраняют verified actor.

PostgreSQL 17 regression и rollback зелёные.

Merge PR #389: `5d63d490ad8f210e10cea59e0f9f14863e72b0de`.

Repository SQL signatures готовы. Они не deployed в production.

## Detached Edge module

`task-action-edge-identity-v2.js`:

- принимает только governed bounded action;
- требует verified actor отдельно от client payload;
- запускает `validateTaskEdgeAction()`;
- строит canonical `p_*` args;
- добавляет `p_actor_id`;
- в preview не вызывает RPC;
- в `mock_execute` вызывает ровно один injected mock RPC;
- не использует `fetch`, `Deno.env`, service key или Supabase client;
- не импортирован в production `index.ts`.

Флаги:

- `target_sql_signature_ready=true` — только repository prototype;
- `actor_aware_sql_prototype_ready=true`;
- `actor_aware_sql_deployed=false`;
- `runtime_integrated=false`;
- `edge_deployed=false`;
- `transport_enabled=false`.

## Exact Edge-to-SQL parity

Parity runner извлекает реальные actor-aware SQL definitions и порядок параметров.

Для пяти task actions проверяются exact RPC name и exact порядок аргументов:

1. start;
2. completion с evidence;
3. active outcome;
4. terminal proposal;
5. terminal decision.

Для каждого preview:

- `Object.keys(rpc_args)` совпадает с SQL parameter order;
- `p_actor_id` последний и равен verified actor;
- semantic fixture совпадает побайтно по структуре;
- сеть не вызывается;
- runtime/deployment/transport остаются выключены.

Шестой overload — `nav_v2_create_bounded_tasks(..., p_actor_id)` — инвентаризируется отдельно, потому что создание selected bounded tasks не является действием кнопки существующей задачи.

## Spoof rejection

До mock RPC отклоняются:

- legacy action;
- actor в client payload;
- неверный verified actor UUID;
- неизвестное top-level поле;
- contract version не 2;
- недопустимый reason code.

Rejected case делает ноль RPC calls и ноль network calls.

## PostgreSQL 17 identity proof

Synthetic identity harness по-прежнему доказывает исходную проблему:

### User JWT

- `auth.uid()` содержит UUID пользователя;
- `authenticated` не имеет EXECUTE на service-role-only function.

### Service role

- service role имеет EXECUTE;
- без пользовательского `sub` canonical `auth.uid()` равен `null`.

### Explicit verified actor

- active profile принимается;
- inactive profile отклоняется;
- identity probe не меняет profile rows.

Actor-aware lifecycle и audit отдельно доказаны PR #389.

## Что этот PR не меняет

- production Supabase;
- `supabase/migrations`;
- production actor-aware SQL;
- Auth/RLS/grants;
- deployed Edge `index.ts`;
- bearer verification runtime;
- service keys;
- legacy task transport;
- frontend bounded transport;
- task rows;
- controlled pilot.

## Production gate

До реальной Edge integration требуются:

1. owner approval final actor propagation architecture;
2. production migration approval;
3. применение bounded + actor-aware SQL в разрешённой среде;
4. настоящий authenticated application E2E;
5. доказательство bearer user → verified actor → actor-aware RPC → audit actor;
6. отдельный Edge integration/deploy PR;
7. controlled frontend transport switch;
8. controlled pilot.

Issue #282 остаётся обязательным cost gate. Generic-команда «продолжай» не является cost или deployment approval.

## Rollback

Repository rollback:

- вернуть identity contract schema v1;
- вернуть handler flags к состоянию до SQL parity;
- удалить Edge-to-SQL parity runner;
- вернуть semantic runner, checker, workflow и этот документ.

Database/Edge rollback не требуется: production не меняется.
