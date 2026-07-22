# Navigator v2 — Write amplification and storage measurement v1

Дата live capture: 22 июля 2026 года, `04:51:36 UTC`.

## Цель

Проверить в изолированном PostgreSQL 17, какую дополнительную synthetic write и storage нагрузку создаёт отдельный индекс:

`nav_deal_answers_v2_deal_idx (deal_id)`

при наличии unique composite index:

`nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

Это repository-only evidence. Оно не является production benchmark, migration или разрешением удалить индекс.

## Live read-only snapshot

Aggregate catalog/statistics-only transaction без PII и business rows зафиксировала для `public.nav_deal_answers_v2`:

- heap: `8192` bytes;
- total relation: `81920` bytes;
- `seq_scan=4`;
- `idx_scan=0`;
- `n_tup_ins=0`;
- `n_tup_upd=0`;
- `n_tup_del=0`;
- `n_live_tup=0`;
- `n_dead_tup=0`;
- analyze/vacuum timestamps отсутствуют;
- `pg_stat_database.stats_reset=null`.

Оба candidate indexes занимают по `16384` bytes и имеют нулевые scan counters в этом snapshot.

Эти значения не доказывают отсутствие production rows или workload. Статистическая оценка противоречит ранее зафиксированной фактической небольшой cardinality, а начало database statistics window неизвестно.

Global WAL snapshot:

- records: `71492`;
- FPI: `14439`;
- bytes: `58847968`;
- reset: `2026-06-13T20:56:11.77719+00:00`.

Global WAL относится ко всей базе и всем модулям. Его нельзя приписывать Navigator или конкретному индексу.

## Synthetic PostgreSQL 17 workload

Harness создаёт только schema `harness` в чистой CI database.

Две одинаковые child tables используют общий synthetic parent set:

1. `single_and_composite_indexes`:
   - single `(deal_id)`;
   - unique composite `(deal_id, question_key)`.
2. `composite_unique_index_only`:
   - только unique composite `(deal_id, question_key)`.

FK shape повторяет live contract:

- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`.

Synthetic cardinality:

- parent deals: `6000`;
- referenced deals: `5000`;
- answers per deal: `20`;
- insert rows per mode: `100000`.

В каждом режиме последовательно выполняются:

1. insert `100000` rows;
2. indexed update `10000` rows через изменение `deal_id`;
3. delete этих `10000` updated rows;
4. final cardinality `90000` rows.

## Statement-local WAL and buffers

Каждый write statement выполняется через:

`EXPLAIN (ANALYZE, BUFFERS, WAL, TIMING FALSE, SUMMARY TRUE, FORMAT JSON)`

Artifact сохраняет:

- WAL records;
- WAL full-page images;
- WAL bytes;
- shared hit/read/dirtied/written blocks;
- statement execution time;
- row count after operation;
- полный JSON plan.

Метрики извлекаются из конкретного statement plan, а не из global production counters.

Даже statement-local CI WAL остаётся synthetic evidence. Он зависит от generated distribution, container filesystem, PostgreSQL build, cache state и порядка операций.

## Synthetic storage evidence

После insert, indexed update и delete для каждого режима сохраняются:

- heap bytes;
- total relation bytes;
- single index bytes;
- composite index bytes;
- total candidate index bytes.

Harness требует, чтобы дополнительный single index реально занимал место в режиме `single_and_composite_indexes`, а в composite-only режиме отсутствовал.

Это не production storage forecast. Небольшой live index размер `16384` bytes соответствует минимальным страницам и не показывает будущую экономию при реальном росте данных.

## Semantic equivalence

Performance evidence не принимается, если workload semantics различаются.

Harness проверяет:

- по `100000` rows после insert;
- unchanged cardinality после indexed update;
- по `90000` rows после delete;
- отсутствие удалённых/перемещённых deal ranges;
- одинаковый deterministic hash итоговых rows;
- одинаковый FK shape;
- полный transaction rollback;
- отсутствие schema `harness` после rollback.

## No performance threshold

В contract отсутствуют ratio или absolute thresholds, автоматически разрешающие index removal.

Запрещены выводы вида:

- «synthetic WAL меньше, значит production index можно удалить»;
- «CI execution time быстрее, значит production latency улучшится»;
- «synthetic relation size равен будущей production экономии»;
- «нулевой live `idx_scan` означает ненужный индекс».

Synthetic numbers пригодны только для сравнения формы write workload в одном воспроизводимом CI harness.

Decision:

`synthetic_write_storage_measurement_completed_production_drop_not_ready`

Решение candidate остаётся:

`review_possible_redundancy_only`

## Production index removal remains blocked

Перед любым production DDL всё ещё обязательны:

1. известное начало production statistics window;
2. representative authenticated workload;
3. production `EXPLAIN ANALYZE` на representative non-PII fixtures;
4. production-scale FK parent mutation benchmark;
5. production write amplification/storage benefit measurement;
6. authenticated regression suite;
7. exact forward и rollback migration;
8. отдельное owner approval на production DDL.

Synthetic measurement закрывает только repository-level methodology и CI evidence.

## CI

Workflow:

`.github/workflows/nav-v2-index-write-storage-measurement-v1.yml`

Он выполняет:

- JSON validation;
- Python source contract;
- isolated PostgreSQL 17 workload;
- JSON plan/artifact capture;
- semantic assertions;
- full rollback;
- post-rollback schema absence check.

Workflow не содержит Supabase API calls, migration apply, branch creation или cost confirmation.

## Production remains unchanged

В рамках этого среза:

- production index не удалялся и не создавался;
- migrations не применялись;
- production rows не читались и не менялись;
- Auth, RLS, grants и Edge Functions не менялись;
- Supabase preview branch, users и secrets не создавались;
- `leader_*` не затрагивался;
- `production_ddl_authorized=false`;
- `index_drop_authorized=false`.
