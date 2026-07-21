# Navigator v2 — Index query-plan candidate v1

Дата live consumer capture: 21 июля 2026 года, `13:53:02 UTC`.

## Index query-plan candidate

Этот срез продолжает Navigator-only Performance Advisor работу и проверяет два zero-scan индекса на isolated PostgreSQL 17 synthetic data.

Цель — получить структурные query-plan evidence, а не принять production DDL решение.

Production remains unchanged.

- production indexes не удалялись и не создавались;
- migrations не применялись;
- production schema и data не копировались в harness;
- RLS, Auth, grants и Edge не менялись;
- Supabase branch и technical accounts не создавались;
- `leader_*` не изменялись;
- `production_ddl_authorized=false`;
- `index_drop_authorized=false`.

## Live consumer inventory

Aggregate/function-signature-only read-only capture показал:

- 24 Navigator RPC содержат `nav_user_profiles` и role-dependent logic;
- среди них access gates, user/profile health, operational reports, queues и admin routes;
- 2 Navigator RPC напрямую упоминают `nav_deal_answers_v2` — demo seed и demo cleanup;
- PII не возвращалась;
- DDL/DML не выполнялись.

Это не означает, что каждый из 24 RPC использует именно role index в каждом плане. Это доказывает, что role является реальным operational predicate и его индекс нельзя объявлять ненужным только по `idx_scan=0`.

## Synthetic PostgreSQL 17 harness

`tests/sql/nav_v2_index_query_plan_harness_v1.sql` создаёт только schema `harness` в чистой CI database.

Synthetic cardinality:

- profiles: `120000`;
- deals: `5000`;
- answers per deal: `20`;
- answers total: `100000`.

Harness:

1. выполняет `ANALYZE` synthetic tables;
2. сохраняет natural cost-based `EXPLAIN (FORMAT JSON)`;
3. отдельно проверяет structural applicability с `enable_seqscan=off`;
4. удаляет индекс только в synthetic transaction;
5. повторно сохраняет plans;
6. проверяет result equivalence;
7. выполняет полный `rollback`;
8. проверяет, что schema `harness` отсутствует после rollback.

Synthetic plan не является production benchmark. Он не учитывает реальную cardinality, cache, concurrency, write rate, statistics age и authenticated traffic mix.

## Role index result

Индекс:

`nav_user_profiles_role_idx (role)`

Live snapshot:

- `idx_scan=0`;
- size `16384` bytes;
- FK support: нет;
- direct role-dependent Navigator RPC inventory: `24`.

Synthetic result:

- role predicate структурно обслуживается `nav_user_profiles_role_idx`;
- после synthetic removal эквивалентного role-leading index нет;
- query falls back to sequential scan.

Decision:

`retain`

Причина: role используется в access gates, management/health reports, queue routing и operational summaries, а production observation window не доказан.

## Answers prefix result

Single-column index:

`nav_deal_answers_v2_deal_idx (deal_id)`

Overlapping unique index:

`nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`

Live snapshot:

- оба индекса имеют `idx_scan=0`;
- каждый занимает `16384` bytes;
- `deal_id` — leading prefix composite unique index.

Synthetic result после удаления только single-column index:

- query по `deal_id` с сортировкой `question_key` обслуживается composite unique index;
- synthetic child-row lookup для FK check также обслуживается composite unique index;
- result hash до и после synthetic removal совпадает.

Decision:

`review_possible_redundancy_only`

Это не drop approval. Production removal всё ещё требует workload observation, actual query plans, parent update/delete benchmark, write-cost benefit, regression и exact rollback.

## No production DDL

Перед любым production index removal обязательны:

1. известное начало production statistics window;
2. representative authenticated workload;
3. review всех production query consumers;
4. `EXPLAIN ANALYZE` на representative non-PII fixtures;
5. FK parent update/delete impact benchmark;
6. write amplification и storage benefit estimate;
7. authenticated regression suite;
8. exact forward и rollback migration;
9. отдельное owner approval на production DDL.

Synthetic proof закрывает только structural planner question.

## Active stops

- production statistics window отсутствует;
- authenticated workload evidence отсутствует;
- production `EXPLAIN ANALYZE` отсутствует;
- FK parent mutation benchmark отсутствует;
- write-cost benefit отсутствует;
- production migration отсутствует;
- owner DDL approval отсутствует.

## CI evidence

Workflow:

`.github/workflows/nav-v2-index-query-plan-harness-v1.yml`

Он проверяет source contract, поднимает PostgreSQL 17, запускает synthetic SQL, сохраняет JSON plans в log artifact и требует full rollback.

Generated migration не создаётся. Cloud API не вызывается.

## Следующий безопасный шаг

Без отдельного DDL approval разрешено:

- улучшить synthetic parent update/delete benchmark;
- составить exact production query mapping без PII;
- повторить read-only `idx_scan` capture после контролируемого observation window;
- не удалять production indexes.
