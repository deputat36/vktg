# Navigator v2 — Production-scale FK benchmark plan v1

Дата: 22 июля 2026 года.

## Цель

Подготовить точный, воспроизводимый и безопасный протокол будущего production-scale benchmark для индекса:

`nav_deal_answers_v2_deal_idx (deal_id)`

при сохранённом unique composite index:

`nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

Этот документ не разрешает benchmark execution, Supabase branch creation, production DML, production DDL или удаление индекса.

## Execution remains blocked

Текущее состояние:

- `benchmark_execution_authorized=false`;
- `cloud_execution_allowed=false`;
- `production_dml_authorized=false`;
- `production_ddl_authorized=false`;
- `selected_environment=null`;
- `preview_branch_created=false`;
- `cost_rechecked=false`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`.

Допустимые future environments:

1. disposable Supabase preview branch после fresh cost recheck и отдельного owner approval;
2. isolated ephemeral PostgreSQL 17.

Запрещены:

- production database;
- shared non-disposable database;
- real employee accounts;
- copied production rows;
- real client identifiers.

## Основание плана

Протокол использует уже закрытое repository evidence:

- canonical FK semantics и transaction-local scan attribution;
- exact non-PII query-to-index mapping;
- synthetic write/storage measurement.

Текущие решения остаются:

- `nav_user_profiles_role_idx` — `retain`;
- `nav_deal_answers_v2_deal_idx` — `review_possible_redundancy_only`;
- synthetic FK semantics — доказаны;
- synthetic write/storage methodology — доказана;
- production-scale evidence — отсутствует.

## Read-only preflight

Файл:

`tests/sql/nav_v2_production_scale_fk_benchmark_readonly_preflight_v1.sql`

Он допускает только:

- catalog metadata;
- estimated rows из `pg_class.reltuples`;
- relation/index sizes;
- table/index statistics;
- FK definition и actions;
- database statistics reset;
- selected PostgreSQL settings.

Preflight выполняется внутри:

`BEGIN TRANSACTION READ ONLY → aggregate/catalog query → ROLLBACK`

Он не возвращает:

- exact business row counts;
- business rows;
- PII;
- client identifiers;
- employee data.

Он не выполняет:

- INSERT;
- UPDATE;
- DELETE;
- CREATE/ALTER/DROP;
- benchmark workload.

## Unresolved capacity inputs

Production-scale нельзя назначать произвольно.

До execution должны быть отдельно определены и утверждены:

- planning horizon: `12 months`;
- target deal rows;
- target answer rows;
- answers-per-deal distribution;
- peak concurrent mutations;
- branch compute class;
- maximum benchmark runtime.

Текущие значения всех перечисленных capacity inputs, кроме planning horizon, равны `null`.

Правило:

`inputs_may_not_be_guessed=true`

Baseline scale:

`max(fresh_observed_rows, approved_target_rows)`

Stress scale:

`2 × baseline_scale`

Если scale не помещается в approved environment, его уменьшение требует recorded reason. Уменьшенный тест нельзя выдавать за полный production-scale evidence.

## Dataset policy

Benchmark dataset должен быть:

- полностью synthetic;
- deterministic;
- generated from recorded seed;
- описан manifest;
- подтверждён generated-row hash;
- одинаков для обоих comparison modes.

Запрещено:

- копировать production rows;
- использовать реальные ФИО, телефоны, email или адреса;
- использовать аккаунты сотрудников;
- импортировать файлы клиентов;
- сохранять benchmark dataset после cleanup.

## Comparison modes

### Mode A

`single_and_composite_indexes`

- single `(deal_id)` присутствует;
- unique composite `(deal_id, question_key)` присутствует.

### Mode B

`composite_unique_index_only`

- single `(deal_id)` отсутствует;
- unique composite `(deal_id, question_key)` присутствует.

Оба режима должны стартовать с одного и того же deterministic dataset snapshot.

## Required mutation matrix

Для каждого режима обязательны:

1. parent delete без children;
2. parent delete с одним child;
3. parent delete с median children count;
4. parent delete с p95 children count;
5. parent delete с maximum bounded children count;
6. successful parent key update без children;
7. rejected referenced parent key update с SQLSTATE `23503`;
8. mixed batch из deletes и rejected updates.

FK contract обязан совпадать с production:

- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- validated;
- non-deferrable;
- initially immediate.

## Concurrency matrix

Обязателен serial mode:

`concurrency=1`

Дополнительно должны быть разрешены:

- approved peak concurrency;
- approved peak plus headroom.

Сейчас оба значения равны `null`. Пока они не утверждены, execution блокируется.

## Measurement protocol

PostgreSQL major:

`17`

Для каждого case и comparison mode:

- 5 warmup iterations;
- 20 measured iterations;
- randomized case order;
- одинаковый dataset snapshot;
- `EXPLAIN ANALYZE, BUFFERS, WAL, FORMAT JSON`;
- `TIMING FALSE`;
- relation/index sizes;
- row counts;
- deterministic result hashes;
- lock/statement timeouts;
- deadlock outcome;
- server settings manifest;
- transaction rollback.

Cold-cache claims запрещены, если cache state не контролируется и не доказан отдельно.

## Required outputs

Future execution обязано сформировать:

- environment manifest;
- cost confirmation reference для preview branch;
- resolved scale/concurrency inputs;
- dataset manifest и seed;
- server settings manifest;
- per-case JSON plans;
- per-case WAL/buffer metrics;
- lock/timeout/deadlock outcomes;
- index/relation size snapshots;
- semantic equivalence report;
- cleanup report;
- decision note без автоматического DDL claim.

## No automatic threshold

Протокол не содержит фиксированного latency, WAL или storage ratio, который автоматически разрешает DROP INDEX.

Значения:

- `fixed_latency_ratio_for_drop_approval=null`;
- `fixed_wal_ratio_for_drop_approval=null`;
- `fixed_storage_ratio_for_drop_approval=null`;
- `automatic_index_drop_decision=false`.

Fail conditions:

- semantic mismatch;
- unexpected FK result;
- timeout;
- deadlock;
- missing artifact;
- incomplete cleanup.

Даже полностью успешный benchmark остаётся только evidence. После него отдельно нужны authenticated regression, exact forward/rollback migration и owner production DDL approval.

## Preview branch gate

Если выбран Supabase preview branch, перед созданием обязательны:

1. fresh organization/branch cost lookup;
2. показ суммы и валюты владельцу;
3. отдельное explicit cost approval;
4. `confirm_cost`;
5. `cost_confirmation_id`;
6. disposable branch максимум на 6 часов;
7. automatic delete deadline;
8. synthetic-only data;
9. cleanup до удаления;
10. branch deletion evidence.

Edge deploy и technical Auth accounts для самого FK benchmark не требуются.

Generic команды `продолжай`, `работай по плану` и `действуй автономно` не являются approval на cost confirmation или branch creation.

## Active stops

- benchmark execution не разрешён;
- environment не выбран;
- fresh statistics window отсутствует;
- capacity forecast не утверждён;
- concurrency не утверждён;
- compute/runtime не утверждены;
- preview cost approval отсутствует, если будет выбран preview;
- production EXPLAIN ANALYZE отсутствует;
- authenticated regression отсутствует;
- production migration отсутствует;
- owner DDL approval отсутствует.

Decision:

`production_scale_fk_benchmark_protocol_prepared_execution_blocked`

## CI scope

Workflow:

`.github/workflows/nav-v2-production-scale-fk-benchmark-plan-v1.yml`

Он выполняет только:

- JSON validation;
- Python compilation;
- source-contract validation;
- проверку отсутствия benchmark execution и cloud action markers.

Workflow не запускает SQL preflight, benchmark, `psql`, Supabase API, branch creation, migration или Edge deploy.

## Production remains unchanged

В рамках подготовки протокола:

- production SQL не выполнялся;
- production rows не читались и не менялись;
- production index не удалялся и не создавался;
- migrations не применялись;
- Supabase branch не создавалась;
- Auth, RLS, grants и Edge не менялись;
- accounts/secrets не создавались;
- `leader_*` не затрагивался.
