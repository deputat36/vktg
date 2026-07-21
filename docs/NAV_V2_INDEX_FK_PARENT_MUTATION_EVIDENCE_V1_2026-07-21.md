# Navigator v2 — FK parent mutation evidence v1

Дата live read-only capture: 21 июля 2026 года.

## FK parent mutation evidence

Этот repository-only срез уменьшает неопределённость вокруг индекса:

`nav_deal_answers_v2_deal_idx (deal_id)`

Он не разрешает удаление production index и не является production benchmark.

Production remains unchanged.

- production indexes не удалялись и не создавались;
- migrations не применялись;
- production data не копировалась;
- Auth, RLS, grants и Edge Functions не менялись;
- Supabase preview branch и technical accounts не создавались;
- `leader_*` не затрагивался;
- `production_ddl_authorized=false`;
- `index_drop_authorized=false`.

## Live read-only FK contract

Aggregate catalog-only transaction без PII зафиксировала:

- child: `public.nav_deal_answers_v2`;
- parent: `public.nav_deals_v2`;
- constraint: `nav_deal_answers_v2_deal_id_fkey`;
- definition: `FOREIGN KEY (deal_id) REFERENCES nav_deals_v2(id) ON DELETE CASCADE`;
- parent update: `NO ACTION`;
- parent delete: `CASCADE`;
- `validated=true`;
- `deferrable=false`;
- `initially_deferred=false`.

Live index overlap:

1. `nav_deal_answers_v2_deal_idx (deal_id)`;
2. unique `nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

Captured snapshot:

- оба индекса по `16384` bytes;
- `idx_scan=0` для обоих;
- row estimates: `23 deals / 7 answers`;
- `pg_stat_database.stats_reset=null`.

Небольшая cardinality и неизвестное начало statistics window не позволяют делать production performance выводы.

## Synthetic PostgreSQL 17 mutation harness

Canonical file:

`tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql`

Один isolated transaction создаёт:

- `5002` synthetic parent deals;
- `5000` referenced deals;
- `20` answers на referenced deal;
- `100000` answer rows;
- single `(deal_id)` index;
- unique composite `(deal_id, question_key)` index.

Последовательно сравниваются режимы:

1. `single_and_composite_indexes`;
2. `composite_unique_index_only` после удаления только synthetic single index.

В каждом режиме выполняются три cases:

1. referenced parent `DELETE` с `ON DELETE CASCADE`;
2. unreferenced parent key `UPDATE`, который должен пройти;
3. referenced parent key `UPDATE`, который должен быть отклонён FK с SQLSTATE `23503`.

Итого harness сохраняет шесть mutation evidence rows.

## Transaction-local index attribution

PostgreSQL 17 transaction-local scan count читается через catalog function:

`pg_stat_get_xact_numscans(index_oid)`

View `pg_stat_xact_user_indexes` не существует и не используется.

Для каждой mutation сохраняются:

- scan counts до и после;
- delta single-column index;
- delta composite unique index;
- наличие single index;
- parent/child counts;
- affected child rows;
- SQLSTATE для blocked mutation;
- diagnostic elapsed time.

После synthetic removal single index harness требует `composite_scan_delta > 0` для successful parent delete и unreferenced update.

## Referenced parent update rejection

Live FK использует `ON UPDATE NO ACTION`.

Поэтому изменение ключа referenced parent должно завершаться:

`23503 foreign_key_violation`

Harness проверяет это в обоих режимах и подтверждает:

- старый parent key остаётся;
- новый parent key не создаётся;
- child rows сохраняются;
- constraint semantics не ослабляются без single index.

## BUFFERS and WAL evidence

Successful parent DELETE и UPDATE выполняются через:

`EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)`

JSON plan сохраняется как CI evidence. Timing, buffers и WAL нельзя трактовать как production latency или production cost.

Synthetic index sizes также сохраняются только как CI diagnostics, не как production storage estimate.

## Семантические результаты

В обоих index modes подтверждаются:

- ровно `20` child rows удаляются cascade;
- unreferenced parent update проходит;
- referenced parent update блокируется `23503`;
- composite leading-prefix lookup остаётся структурно применимым;
- после двух cascade deletes остаётся `99960` answers;
- после двух deletes и двух successful updates остаётся `5000` deals;
- synthetic FK остаётся validated, non-deferrable и initially-immediate;
- полный transaction rollback проходит;
- schema `harness` после rollback отсутствует.

Decision:

`synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready`

## CI timing is not production performance

CI runner, cold cache, container I/O и generated distribution отличаются от production.

Запрещено использовать evidence как:

- production latency estimate;
- доказательство, что composite быстрее;
- автоматическое разрешение на index removal;
- замену authenticated regression;
- замену production-scale benchmark.

## Production index drop remains blocked

Перед любым production removal обязательны:

1. известное начало production statistics window;
2. representative authenticated workload;
3. review production query consumers;
4. production `EXPLAIN ANALYZE` на representative non-PII fixtures;
5. production-scale FK parent UPDATE/DELETE benchmark;
6. write amplification и storage benefit estimate;
7. authenticated regression suite;
8. exact forward и rollback migration;
9. отдельное owner approval на production DDL.

Active stops:

- `production_statistics_window_missing`;
- `authenticated_workload_missing`;
- `production_explain_analyze_missing`;
- `production_scale_fk_parent_mutation_benchmark_missing`;
- `write_cost_benefit_missing`;
- `production_migration_missing`;
- `owner_ddl_approval_missing`.

## CI

Canonical workflow:

`.github/workflows/nav-v2-index-query-plan-harness-v1.yml`

Проверяются:

- JSON/source contract;
- PostgreSQL 17 query-plan evidence;
- hardened PostgreSQL 17 FK parent mutation evidence;
- artifact upload;
- отсутствие cloud actions;
- отсутствие generated migration.

Production remains unchanged.
