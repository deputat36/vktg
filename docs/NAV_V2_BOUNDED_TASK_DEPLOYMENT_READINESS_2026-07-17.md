# Navigator v2 — bounded task deployment readiness

Дата: 17 июля 2026 года.

Статус: repository-only deployment readiness dry-run. Это не migration PR и не разрешение на production deployment.

## Цель

Собрать уже проверенные bounded-task SQL-прототипы в один воспроизводимый deployment-readiness bundle и доказать в PostgreSQL 17:

- точный apply order;
- отсутствие массового backfill;
- сохранность legacy rows;
- service-role-only governed RPC;
- contract-aware lite DTO v2;
- отсутствие автоматических task triggers;
- отсутствие изменений сделок, документов и рисков;
- полный rollback до исходной legacy-схемы.

## Apply order

Порядок является обязательным:

1. `supabase/prototypes/nav_v2_bounded_task_contract.sql`;
2. `supabase/prototypes/nav_v2_bounded_task_mutations.sql`;
3. `supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql`;
4. `supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql`.

Все файлы остаются в `supabase/prototypes`. Bundle не создаёт файл в `supabase/migrations` и ничего не применяет через Supabase Management API.

## Зависимости

Перед apply требуются существующие production-сущности, синтетически воспроизводимые setup-файлами:

- `auth.uid()`;
- роли `anon`, `authenticated`, `service_role`;
- `nav_v2_user_role`, task status/priority enums;
- `nav_user_profiles`;
- `nav_deals_v2`;
- `nav_deal_tasks_v2` legacy schema;
- `nav_deal_events_v2`;
- deal access helpers;
- document/risk tables и permission helpers для lite DTO.

## Grant policy

В prototype bundle governed RPC доступны только `service_role`:

- `nav_v2_create_bounded_tasks`;
- `nav_v2_start_bounded_task`;
- `nav_v2_complete_bounded_task`;
- `nav_v2_set_bounded_task_active_outcome`;
- `nav_v2_propose_bounded_task_terminal_outcome`;
- `nav_v2_decide_bounded_task_terminal_outcome`.

`public`, `anon` и `authenticated` не получают `EXECUTE`.

Legacy `nav_v2_add_task` и `nav_v2_update_task_status` также становятся service-role-only внутри prototype overlay. Это соответствует будущему Edge-mediated transport, но не применяется к production до отдельного deployment approval.

Authenticated EXECUTE остаётся deferred. Frontend bounded transport включать до Edge authorization запрещено.

## Mutation lifecycle job

Отдельная PostgreSQL 17 service database выполняет:

1. synthetic Auth/roles/deals/legacy task setup;
2. bounded base contract;
3. governed mutation overlay;
4. существующие role/lifecycle/evidence/idempotency/separation assertions;
5. mutation rollback;
6. base contract rollback;
7. проверку возврата к legacy schema и grants.

Этот job не смешивается с DTO lifecycle, чтобы synthetic active-duplicate scenarios не влияли друг на друга.

## DTO lifecycle job

Вторая независимая PostgreSQL 17 service database выполняет:

1. synthetic mutation setup;
2. lite DTO setup;
3. baseline snapshot legacy task/deals/documents/risks/triggers;
4. четыре prototype-файла в обязательном apply order;
5. существующие privacy/role/no-mutation DTO assertions;
6. агрегированные deployment-readiness assertions;
7. DTO rollback;
8. mutation rollback;
9. base contract rollback;
10. final rollback assertions и удаление test snapshot schema.

## Apply assertions

### Legacy safety

- исходная legacy-задача не получает `task_contract_version`;
- core fields legacy row не меняются;
- количество legacy rows остаётся прежним;
- массовый backfill отсутствует.

### Process separation

- строки сделок не меняются;
- документы не меняются;
- риски не меняются;
- новые non-internal triggers на `nav_deal_tasks_v2` не создаются;
- readiness, deal status и risk gates не меняются автоматически.

### Schema safety

- bounded constraints существуют как `NOT VALID`, чтобы не сканировать и не переопределять исторические legacy rows;
- новые bounded rows всё равно проверяются этими constraints;
- mutation event table имеет RLS;
- `authenticated` и `anon` не читают audit events;
- governed RPC являются `SECURITY DEFINER` с фиксированным `search_path`.

### DTO safety

- `dto_version=2`;
- `task_contract_aware=true`;
- bounded contract/permission fields доступны;
- legacy coexistence сохраняется;
- description, client name, phone и полный legacy title не попадают в lite DTO.

## Complete rollback

Rollback выполняется в обратном порядке:

1. bounded lite DTO overlay → explicit DTO v1;
2. governed mutation overlay → legacy mutation functions/grants;
3. bounded base contract → исходная task schema.

Полный rollback удаляет:

- governed RPC;
- mutation event table;
- mutation-only subject/outcome audit columns;
- base contract columns;
- bounded catalog/suggestion functions;
- bounded constraints.

Rollback восстанавливает и проверяет:

- lite DTO v1;
- legacy task type constraint;
- legacy add/status RPC;
- synthetic authenticated/service grants;
- исходную legacy task row;
- исходное количество task rows и triggers.

## Что не разрешает этот bundle

Зелёный dry-run не разрешает:

- production migration;
- создание Supabase preview branch;
- изменение production grants/RLS/Auth;
- Edge Function deployment;
- frontend bounded transport;
- controlled pilot;
- массовый backfill;
- использование метрик для оценки сотрудников.

Он не является authenticated application E2E. Issue #282 продолжает запрещать платную preview branch без нового explicit approval владельца.

## Production boundary

Production project `ofewxuqfjhamgerwzull` используется только для read-only проверки отсутствия bounded schema/RPC.

В этом slice не выполняются:

- SQL/DDL в production;
- `apply_migration`;
- branch creation;
- Auth user creation;
- RLS/grants changes;
- Edge deployment;
- task-row changes.

## Remaining blockers

- explicit cost approval отсутствует;
- реальный authenticated application E2E отсутствует;
- production migration не создан и не review-нут;
- production grants не утверждены;
- Edge actions не интегрированы;
- frontend bounded transport выключен;
- controlled pilot не утверждён.

## Следующий gate

После зелёного bundle можно подготовить отдельный repository-only migration storyboard/diff, но не создавать production migration и не применять SQL без нового решения владельца.

Реальный deployment order остаётся:

1. explicit cost/environment approval;
2. authenticated application E2E;
3. отдельный reviewed database migration;
4. minimal grants и advisor review;
5. Edge action integration/deployment;
6. controlled frontend transport switch;
7. controlled pilot;
8. security hardening.

## Rollback

Rollback этого PR repository-only:

- удалить manifest;
- удалить snapshot/readiness/base/final SQL assertions;
- удалить workflow/checker/docs.

Production rollback не требуется, потому что production state не меняется.
