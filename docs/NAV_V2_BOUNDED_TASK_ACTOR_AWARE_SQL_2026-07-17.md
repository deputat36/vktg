# Navigator v2 — actor-aware bounded task SQL

Дата: 17 июля 2026 года.

Статус: repository-only actor-aware SQL prototype. Это не migration, не production apply и не Edge deployment.

## Identity contract

PR #387 доказал конфликт текущего governed prototype:

- canonical SQL использует `auth.uid()`;
- governed RPC разрешены только `service_role`;
- пользовательский JWT содержит actor, но authenticated не имеет EXECUTE;
- service-role transport имеет EXECUTE, но не гарантирует пользовательский `sub`.

Actor-aware prototype устраняет этот разрыв в изолированном SQL overlay:

`verified Edge actor → p_actor_id → service-role-only overload → local actor claim → canonical governed RPC`

Actor должен быть получен Edge только после проверки bearer token. Client action payload не является источником actor.

## Overload strategy

Canonical governed RPC остаются без изменений. Overlay добавляет overloads с тем же RPC name и дополнительным последним аргументом `p_actor_id`:

- create bounded tasks;
- start;
- complete;
- active outcome;
- terminal proposal;
- terminal decision.

Преимущества:

- detached Edge mapping сохраняет canonical RPC names;
- PostgREST выбирает actor-aware signature по наличию `p_actor_id`;
- прежний PostgreSQL lifecycle остаётся единым источником бизнес-правил;
- overlay не дублирует task lifecycle и authorization logic;
- rollback удаляет только overloads и private actor helpers.

## Active profile and authorization

`nav_v2_require_verified_actor()` подтверждает:

- `p_actor_id` заполнен;
- пользователь существует в Auth;
- существует активный `nav_user_profiles`.

После этого overload локально устанавливает actor claim и вызывает canonical RPC. Canonical RPC повторно проверяет:

- роль actor;
- доступ к сделке;
- назначение actor на задачу;
- допустимость lifecycle transition;
- evidence/outcome rules;
- terminal decision scope.

Таким образом Edge verification не заменяет database authorization.

## Replay binding

Canonical idempotency использует `client_request_id`. Actor-aware overlay добавляет предварительное правило:

- тот же actor и та же операция получают canonical replay;
- другой actor с тем же `client_request_id` получает отказ;
- другая операция с тем же `client_request_id` получает отказ;
- replay не создаёт новую задачу или audit event.

Это не позволяет одному сотруднику получить результат idempotent-запроса другого сотрудника.

## Claim hygiene

Каждый overload:

1. сохраняет предыдущий `request.jwt.claim.sub`;
2. проверяет actor;
3. проверяет actor replay boundary;
4. локально устанавливает verified actor claim;
5. вызывает canonical governed RPC;
6. восстанавливает предыдущий claim при успехе;
7. восстанавливает предыдущий claim при ошибке.

Result дополняется полями:

- `verified_actor_id`;
- `actor_aware=true`.

Audit event и task actor-поля создаются canonical SQL из установленного verified actor context.

## Grants

Actor-aware overloads:

- отозваны у `public`;
- отозваны у `anon`;
- отозваны у `authenticated`;
- разрешены только `service_role`.

Private actor helpers не открываются пользовательским ролям.

Service role не передаётся в браузер. Этот PR не создаёт и не использует service key.

## Edge mapping

Detached `task-action-edge-identity-v2.js` уже формирует:

- прежнее canonical RPC name;
- прежние `p_*` lifecycle args;
- дополнительный `p_actor_id` из verified Edge context.

Client actor fields запрещены до payload validation. Identity module остаётся detached и не импортирован в production `index.ts`.

## PostgreSQL 17 regression

Workflow применяет в изолированной базе:

1. synthetic Auth/roles/deals/legacy task setup;
2. bounded base contract;
3. canonical governed mutations;
4. actor-aware overlay.

Сначала запускается полный canonical mutation regression. Затем actor-aware assertions проверяют:

- шесть service-role-only overload signatures;
- отсутствие authenticated EXECUTE;
- сохранность canonical signatures;
- создание задач verified SPN;
- `created_by` и create audit actor;
- same-actor replay без дублей;
- cross-actor replay rejection;
- отказ unrelated SPN по canonical deal authorization;
- отказ inactive actor;
- start и evidence completion;
- active outcome;
- terminal proposal юристом;
- terminal decision менеджером;
- audit actor для каждого события;
- отсутствие claim leakage.

## Rollback

Actor-aware rollback:

- удаляет шесть overloads;
- удаляет три private actor helpers;
- не удаляет canonical governed RPC;
- не удаляет bounded rows;
- не удаляет audit events;
- не меняет legacy task.

Rollback assertions подтверждают сохранность canonical lifecycle и данных.

## Что этот PR не меняет

- production Supabase;
- `supabase/migrations`;
- canonical bounded prototypes;
- production Auth/RLS/grants;
- deployed Edge `index.ts`;
- service keys;
- frontend bounded transport;
- legacy task transport;
- existing task rows;
- controlled pilot.

## Production gate

До migration/deployment требуются:

1. owner approval actor propagation architecture;
2. зелёный actor-aware PostgreSQL regression;
3. обновление migration object diff/storyboard;
4. настоящий authenticated application E2E;
5. отдельный production migration PR;
6. отдельный Edge integration/deploy PR;
7. controlled frontend switch и pilot.

Issue #282 остаётся обязательным cost gate.

## Repository rollback

Удалить:

- actor-aware SQL overlay;
- contract/checker/workflow;
- actor-aware assertions и rollback;
- этот документ.

Database rollback не нужен: production не меняется.
