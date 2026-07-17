# Navigator v2 — task Edge identity gate

Дата: 17 июля 2026 года.

Статус: repository-only identity propagation gate. Это не Edge integration, не deployment и не изменение production SQL.

## Текущий конфликт

Governed bounded-task RPC в прототипе:

- используют `auth.uid()` как источник действующего пользователя;
- запрещают EXECUTE для `public`, `anon`, `authenticated`;
- разрешают EXECUTE только `service_role`.

Получается несовместимая пара:

1. пользовательский JWT даёт роль `authenticated` и корректный `auth.uid()`, но RPC недоступен;
2. service-role вызов имеет EXECUTE, но пользовательский `sub` не гарантирован и `auth.uid()` может быть `null`.

Поэтому текущий contract нельзя считать напрямую исполнимым через Edge.

## Почему нельзя просто вызвать service-role RPC

Service-role key нельзя передавать в браузер. Edge может использовать service role, но service-role database request сам по себе не доказывает, от имени какого пользователя выполняется действие.

Если SQL продолжает брать actor только из `auth.uid()`, возможны два неправильных варианта:

- `auth.uid()` равен `null`;
- actor определяется не тем пользовательским контекстом, который прошёл Edge authentication.

Зелёный payload validator не решает эту проблему идентичности.

## Candidate: verified actor injection

Repository rehearsal рассматривает кандидат:

`bearer token → успешная проверка пользователя → verified actor UUID → Edge добавляет p_actor_id → service-role-only RPC`

Правила:

- actor берётся только из результата проверки bearer token;
- actor не принимается из request body;
- payload сначала проходит `validateTaskEdgeAction()`;
- после validation Edge добавляет `p_actor_id` к database args;
- SQL обязан повторно проверить, что actor имеет активный Navigator profile и нужные права;
- current governed SQL signatures пока не содержат `p_actor_id`, поэтому требуется отдельный repository refactor и PostgreSQL regression.

Это candidate, а не утверждённая production architecture.

## Client payload boundary

Запрещены поля:

- `actor_id`;
- `p_actor_id`;
- `user_id`;
- `p_user_id`.

Также запрещены неизвестные top-level поля запроса. Client не может подменить identity, даже если знает UUID другого сотрудника.

Legacy task path не входит в rehearsal. Он остаётся на текущем user-JWT Edge flow.

## Detached Edge module

`task-action-edge-identity-v2.js`:

- принимает canonical bounded action и payload;
- требует verified actor UUID отдельно от payload;
- вызывает существующий Edge payload validator;
- строит exact database args;
- добавляет `p_actor_id`;
- в preview не вызывает RPC;
- в `mock_execute` вызывает ровно один injected mock `rpc_client.rpc`;
- не использует `fetch`, `Deno.env`, service key или Supabase client;
- не импортирован в `index.ts`.

Флаги остаются:

- `runtime_integrated=false`;
- `edge_deployed=false`;
- `transport_enabled=false`;
- `target_sql_signature_ready=false`.

## Semantic matrix

Проверяются accepted flows:

- start;
- completion с evidence;
- waiting_external;
- terminal not_applicable;
- terminal replaced;
- terminal decision.

Для каждого accepted flow:

- preview строит actor-aware RPC args;
- mock execution вызывает один RPC;
- `p_actor_id` всегда равен verified actor;
- сеть не используется.

Rejected cases:

- legacy action;
- actor в client payload;
- invalid verified actor;
- unknown top-level field;
- contract version не 2;
- недопустимый reason code.

## PostgreSQL 17 proof

Synthetic harness доказывает:

### User JWT pattern

- `auth.uid()` содержит UUID пользователя;
- роль `authenticated` не имеет EXECUTE на service-role-only probe.

### Service-role pattern

- service role имеет EXECUTE;
- без пользовательского `sub` функция, использующая только `auth.uid()`, получает `null`.

### Explicit actor candidate

- service-role-only facade принимает actor UUID;
- активный Navigator profile подтверждается;
- неактивный actor отклоняется;
- identity probe не меняет profile rows.

Это архитектурное доказательство, а не production authorization test.

## Что этот PR не меняет

- production Supabase;
- migrations;
- bounded SQL signatures;
- grants/RLS/Auth;
- deployed Edge `index.ts`;
- service keys;
- legacy task transport;
- frontend bounded transport;
- task rows;
- controlled pilot.

## Production gate

До Edge integration требуется отдельное решение:

1. утвердить actor propagation architecture;
2. изменить governed SQL signatures или выбрать другой доказуемый identity mechanism;
3. прогнать PostgreSQL 17 lifecycle/ACL/idempotency regression;
4. обновить migration storyboard/object diff;
5. получить approval на database migration;
6. выполнить настоящий authenticated application E2E;
7. только затем интегрировать и deploy Edge handler.

Issue #282 остаётся обязательным cost gate.

## Rollback

Repository rollback:

- удалить identity handler rehearsal;
- удалить semantic fixtures/runner;
- удалить PostgreSQL identity harness;
- удалить contract, checker, workflow и этот документ.

Database/Edge rollback не требуется: production не меняется.
