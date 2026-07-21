# Navigator v2 — FK parent mutation evidence v1

Дата live read-only capture: 21 июля 2026 года.

## FK parent mutation evidence

Этот срез закрывает только repository-level synthetic gap для индекса:

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

- child table: `public.nav_deal_answers_v2`;
- parent table: `public.nav_deals_v2`;
- constraint: `nav_deal_answers_v2_deal_id_fkey`;
- definition: `FOREIGN KEY (deal_id) REFERENCES nav_deals_v2(id) ON DELETE CASCADE`;
- parent key update action: `NO ACTION`;
- parent delete action: `CASCADE`.

Live index overlap:

1. `nav_deal_answers_v2_deal_idx (deal_id)`;
2. unique `nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

Для обоих индексов в captured snapshot:

- `idx_scan=0`;
- size `16384` bytes;
- `deal_id` является leading prefix composite unique index.

Aggregate row estimates на момент capture:

- deals: `23`;
- answers: `7`;
- `pg_stat_database.stats_reset = null`.

Небольшая текущая cardinality и неизвестное начало statistics window не позволяют делать вывод о production performance.

## Synthetic PostgreSQL 17 mutation harness

Файл:

`tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql`

Harness создаёт две независимые synthetic модели в schema `harness`:

### Mode A — both indexes

Child table имеет:

- single-column index `(deal_id)`;
- unique composite index `(deal_id, question_key)`.

### Mode B — composite prefix only

Child table имеет только:

- unique composite index `(deal_id, question_key)`.

В каждой модели:

- `5001` parent rows до mutation;
- `100000` child rows;
- `20` answers на каждую из `5000` рабочих сделок;
- отдельный parent `6000` без child rows для UPDATE test.

Harness выполняет реальные statements через:

`EXPLAIN (ANALYZE, FORMAT JSON, TIMING FALSE, SUMMARY TRUE)`

Проверяются:

1. parent `DELETE` для deal `4000` с фактическим `ON DELETE CASCADE`;
2. parent key `UPDATE 6000 → 6001` с фактическим `ON UPDATE NO ACTION` child-reference check;
3. наличие trigger evidence в EXPLAIN JSON;
4. одинаковые mutation semantics в двух index modes;
5. одинаковый hash unaffected deal `3000`;
6. полный transaction rollback;
7. отсутствие schema `harness` после rollback.

## DELETE CASCADE result

В обоих index modes:

- parent `4000` удалён;
- все `20` child rows deal `4000` удалены каскадно;
- итоговая child cardinality уменьшилась с `100000` до `99980`;
- actual trigger execution captured в JSON plan.

Это доказывает корректность synthetic delete semantics без single-column index.

Это не доказывает production latency под реальной нагрузкой.

## UPDATE NO ACTION result

В обоих index modes:

- parent `6000` успешно изменён на `6001`;
- child rows для `6000` и `6001` отсутствовали;
- actual FK child-reference check captured в JSON plan;
- mutation semantics совпали.

Update test выбран на parent без child rows, потому что live FK использует `NO ACTION`: изменение ключа parent с существующими children должно блокироваться самой ссылочной целостностью и не подходит для успешного benchmark path.

## CI timing is not production performance

Workflow сохраняет `Execution Time` и trigger list из isolated GitHub Actions PostgreSQL 17.

Эти числа нельзя использовать как:

- production latency estimate;
- доказательство отсутствия regression;
- основание для экономии ресурсов;
- автоматическое разрешение на index removal.

CI timing зависит от runner, cold cache, container I/O и synthetic distribution. Допустимо сравнивать только успешность и semantics внутри одного воспроизводимого harness.

## Что закрыто

Закрыт repository-only вопрос:

`может ли composite unique (deal_id, question_key) поддержать synthetic FK parent mutation semantics без отдельного (deal_id) index?`

Ответ:

`да, в isolated PostgreSQL 17 harness для DELETE CASCADE и UPDATE NO ACTION semantics`.

Decision:

`synthetic_fk_parent_mutation_gap_closed_production_drop_not_ready`

## Production index drop remains blocked

Перед любым production removal всё ещё обязательны:

1. известное начало production statistics window;
2. representative authenticated workload window;
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

Existing workflow расширен:

`.github/workflows/nav-v2-index-query-plan-harness-v1.yml`

Добавлены:

- JSON validation нового evidence contract;
- Python source validator;
- отдельный job `postgres-17-fk-parent-mutation`;
- отдельный artifact с JSON EXPLAIN evidence;
- запрет cloud actions;
- проверка отсутствия generated migration.

Production remains unchanged.
