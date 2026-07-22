# Navigator v2 — Index observation window v1

Дата baseline capture: 22 июля 2026 года, `05:31:47 UTC`.

## Цель

Начать воспроизводимое read only окно наблюдения для индекса:

`nav_deal_answers_v2_deal_idx (deal_id)`

при сохранённом unique composite index:

`nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

Это observation evidence, а не migration, benchmark execution или разрешение удалить индекс.

## Решение

`observation_window_baseline_started_evidence_not_yet_representative`

Текущее состояние:

- `baseline_captured=true`;
- `window_completed=false`;
- `representative_authenticated_workload_proven=false`;
- `production_index_removal_ready=false`;
- `production_ddl_authorized=false`;
- `production_dml_authorized=false`;
- `statistics_reset_authorized=false`;
- `statistics_settings_change_authorized=false`;
- `selected_cadence=null`.

## Что выполнено

Через `BEGIN TRANSACTION READ ONLY ... ROLLBACK` получен aggregate catalog/statistics-only baseline.

Не возвращались:

- строки сделок, ответов, клиентов или сотрудников;
- точные business row counts;
- ФИО, телефоны, email и другие direct identifiers;
- query text из `pg_stat_statements`;
- токены или session data.

Не выполнялись:

- DML или DDL;
- сброс статистики;
- изменение PostgreSQL settings;
- synthetic workload на production database;
- `ANALYZE`, `VACUUM`, `REINDEX` или restart;
- Supabase branch creation или cost confirmation.

## Baseline epoch

Зафиксированы:

- PostgreSQL `17.6`, `server_version_num=170006`;
- database OID `5`;
- postmaster start `2026-06-13T20:56:45.579218+00:00`;
- database `stats_reset=null`;
- WAL `stats_reset=2026-06-13T20:56:11.777190+00:00`;
- candidate table OID `19392`;
- composite index OID `19402`;
- single-column index OID `19583`.

`database.stats_reset=null` не означает известное отсутствие исторических resets. Поэтому baseline считается контролируемой точкой начала только для будущих delta captures.

Следующий capture пригоден для сравнения, только если не изменились:

- database OID;
- postmaster start;
- database и WAL reset identity;
- table/index OID;
- index definitions;
- index validity/readiness;
- candidate schema и migration baseline.

Любое уменьшение monotonic counter также инвалидирует текущее окно.

## Candidate baseline

`public.nav_deal_answers_v2`:

- `seq_scan=4`;
- `seq_tup_read=35`;
- `idx_scan=0`;
- `n_tup_ins=0`;
- `n_tup_upd=0`;
- `n_tup_del=0`;
- heap `8192` bytes;
- total relation `81920` bytes.

Оба candidate indexes:

- valid и ready;
- `idx_scan=0`;
- `idx_tup_read=0`;
- `idx_tup_fetch=0`;
- `16384` bytes каждый.

Эти нулевые counters не доказывают избыточность. Они являются только стартовым значением для будущего delta.

## Global database и WAL counters

Baseline сохраняет database/WAL counters, чтобы обнаружить reset, restart или несопоставимость captures.

Global WAL:

- `wal_records=71494`;
- `wal_fpi=14439`;
- `wal_bytes=58848042`.

Global WAL нельзя приписывать candidate index. Он используется только как epoch и environment evidence.

## Capture template

Канонический template:

`tests/sql/nav_v2_index_observation_window_readonly_capture_v1.sql`

Он читает только:

- `pg_database`;
- `pg_stat_database`;
- `pg_class`;
- `pg_namespace`;
- `pg_index`;
- `pg_stat_all_tables`;
- `pg_stat_all_indexes`;
- `pg_stat_wal`;
- `pg_extension`.

Workflow не исполняет SQL template. Он проверяет только source contract.

## Delta validity

Future capture может быть сопоставлен с baseline, если одновременно выполнены условия:

1. epoch identity совпадает;
2. OID и definitions candidate objects совпадают;
3. counters не уменьшились;
4. не было candidate schema/index DDL;
5. не было statistics reset/settings changes;
6. capture остаётся aggregate-only и без PII/query text.

Future report должен содержать:

- database counter deltas;
- table counter deltas;
- candidate index counter deltas;
- relation size deltas;
- migration и Edge drift summary;
- Auth/API log summary без токенов и PII;
- representativeness assessment;
- invalidation check;
- decision note без automatic DDL claim.

## Незакрытые параметры

Не выбраны и не должны угадываться:

- capture cadence;
- minimum calendar duration;
- minimum authenticated sessions;
- minimum candidate index reads;
- minimum candidate table writes;
- minimum parent mutations.

До их отдельного утверждения observation window нельзя объявить завершённым или representative.

## Что observation window не доказывает

Даже завершённое окно само по себе не доказывает:

- latency superiority или отсутствие regression;
- production write savings конкретного индекса;
- безопасность FK parent mutation без benchmark;
- готовность `DROP INDEX`;
- production DDL approval.

Дополнительно остаются обязательными:

- production `EXPLAIN ANALYZE` на разрешённых non-PII fixtures;
- production-scale benchmark в разрешённой disposable/isolated среде;
- authenticated regression;
- exact forward/rollback migration;
- отдельное owner production DDL approval.

## Active stops

- cadence не выбран;
- completion thresholds не утверждены;
- end capture отсутствует;
- representative authenticated workload не доказан;
- production explain отсутствует;
- production-scale benchmark не выполнен;
- authenticated regression отсутствует;
- production migration отсутствует;
- owner DDL approval отсутствует.

## Границы

Production Supabase остаётся без изменений.

Запрещены:

- reset production statistics;
- изменение statistics settings;
- synthetic workload на production;
- удаление или создание production index;
- применение migration;
- создание branch без fresh cost и отдельного owner approval;
- копирование production rows;
- сбор query text или direct identifiers;
- изменения `leader_*`.
