# Navigator v2 — bounded consolidated candidate v1

Дата: 21 июля 2026 года.

## Статус

Repository-only temporary review candidate.

Production remains unchanged.

- Supabase branch не создаётся;
- SQL не записывается в `supabase/migrations`;
- preview apply запрещён;
- production apply запрещён;
- Edge не деплоится;
- Auth, RLS и grants не меняются;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`.

## Причина

В preview package v1 обнаружен Bounded overlap: независимые rehearsal-сегменты `bounded_core` и `bounded_dto` повторно включали:

- `nav_v2_bounded_task_contract.sql`;
- `nav_v2_bounded_task_mutations.sql`.

Оба сегмента проходят отдельно, но последовательное применение двух готовых rehearsal artifacts не является корректным deployment order.

## Consolidated order

Временный forward candidate собирается ровно один раз в следующем порядке:

1. `nav_v2_bounded_task_contract.sql`;
2. `nav_v2_bounded_task_mutations.sql`;
3. `nav_v2_bounded_task_actor_aware_mutations.sql`;
4. `nav_v2_get_deal_card_lite_explicit_dto.sql`;
5. `nav_v2_get_deal_card_lite_bounded_tasks.sql`.

Временный rollback candidate:

1. `nav_v2_deal_card_lite_bounded_rollback.sql`;
2. `nav_v2_bounded_task_actor_aware_rollback.sql`;
3. `nav_v2_bounded_task_mutation_rollback.sql`;
4. `nav_v2_bounded_task_base_rollback.sql`.

Ни один source path не повторяется.

## Temporary artifacts

Assembler:

`scripts/assemble-nav-v2-bounded-consolidated-candidate-v1.mjs`

Он требует caller-supplied каталог за пределами репозитория и формирует:

- `01-bounded-consolidated-forward.sql`;
- `01-bounded-consolidated-rollback.sql`;
- `bounded-consolidated-index.json`.

Index содержит:

- exact source order;
- source SHA-256 и byte size;
- artifact SHA-256 и byte size;
- exact function redefinition report;
- fail-closed readiness flags.

Generated artifacts не коммитятся.

## Function redefinition

В consolidated forward допустимо только последовательное `CREATE OR REPLACE` одной сигнатуры:

`public.nav_v2_get_deal_card_lite(uuid)`

Сначала устанавливается explicit privacy DTO, затем bounded task overlay расширяет этот DTO. Любая другая точная повторная сигнатура завершает assembler ошибкой.

## Service-role boundary

Actor-aware overloads доступны только `service_role`:

- create bounded tasks;
- start task;
- complete task;
- set active outcome;
- propose terminal outcome;
- decide terminal outcome.

Для них обязательно:

- `REVOKE` от `public`;
- `REVOKE` от `anon`;
- `REVOKE` от `authenticated`;
- `GRANT EXECUTE` только `service_role`.

Private actor helpers не получают внешнего EXECUTE.

Legacy `nav_v2_update_task_status` не меняется.

## PostgreSQL 17 lifecycle

Workflow создаёт synthetic environment и выполняет:

1. task mutation setup;
2. lite DTO setup;
3. consolidated forward;
4. canonical bounded mutation assertions;
5. actor-aware identity/replay assertions;
6. contract-aware DTO assertions;
7. consolidated integration assertions;
8. ALWAYS ROLLBACK;
9. consolidated post-rollback assertions.

Проверяется:

- полный bounded lifecycle;
- actor identity и cross-actor replay rejection;
- service-role-only ACL;
- role-aware DTO;
- legacy task compatibility;
- отсутствие client PII/free text в DTO;
- удаление bounded columns, events и functions после rollback;
- восстановление explicit lite DTO baseline;
- сохранность legacy synthetic task.

## Active stops

После успешного CI остаются обязательными:

- preview branch отсутствует;
- explicit cost approval отсутствует;
- authenticated role matrix не выполнена;
- candidate не применён к preview;
- Edge feature flag выключен;
- Edge не деплоился;
- frontend bounded transport выключен;
- production deployment не утверждён;
- controlled pilot не утверждён.

Успешный PostgreSQL 17 lifecycle не является разрешением на cloud apply.

## Rollback

Repository rollback:

- удалить config, assembler, validators, runner, workflow и этот документ;
- удалить две consolidated assertion files;
- вернуть preview package в состояние `consolidated_*_created=false`.

Production rollback не требуется: production database, Auth, RLS, grants, Edge Functions и rows не меняются.

## Следующий безопасный шаг

После зелёного CI:

- связать validated temporary artifacts с preview candidate package v2;
- сохранить `preview_apply_allowed=false`;
- подготовить точный preview preflight/attestation;
- не создавать Supabase branch без отдельного cost approval;
- не заявлять deployment readiness до authenticated E2E.
