# Navigator v2 — Index observation delta evaluator v1

Дата: 22 июля 2026 года.

## Цель

Подготовить offline evaluator для сравнения двух уже сохранённых read-only observation snapshots индекса:

`nav_deal_answers_v2_deal_idx (deal_id)`

и composite unique index:

`nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

Evaluator не подключается к production database, Supabase или сети. Он читает только локальные JSON-файлы.

## Решение

`observation_delta_evaluator_prepared_offline_only`

Текущее состояние:

- evaluator подготовлен;
- production capture не выполнялся;
- второй approved snapshot отсутствует;
- observation window не завершён;
- `production_index_removal_ready=false`;
- production DDL/DML не разрешены.

## Запуск

```bash
python3 scripts/evaluate_nav_v2_index_observation_delta_v1.py baseline.json current.json
```

Сохранение результата:

```bash
python3 scripts/evaluate_nav_v2_index_observation_delta_v1.py \
  baseline.json current.json \
  --output delta-report.json
```

Self-test:

```bash
python3 scripts/evaluate_nav_v2_index_observation_delta_v1.py --self-test
```

## Exit code

- `0` — snapshots валидны и принадлежат одному epoch;
- `2` — входной JSON или required fields некорректны;
- `3` — observation window инвалидирован, delta нельзя использовать.

Exit code `0` не означает representative workload или готовность удалить индекс.

## Поддерживаемые JSON roots

Evaluator принимает:

- raw capture object;
- `{ "observation_capture": {...} }`;
- `{ "observation_baseline": {...} }`;
- `{ "live_baseline": {...} }`;
- `{ "capture": {...} }`.

## Privacy boundary

Оба snapshots обязаны содержать markers:

- `transaction_read_only=true`;
- `business_rows_returned=false`;
- `pii_returned=false`;
- `data_mutated=false`;
- `ddl_executed=false`;
- `statistics_reset_performed=false`;
- `extensions.query_text_or_user_data_captured=false`.

Любое отклонение инвалидирует window.

Evaluator не читает business rows, ФИО, телефоны, email, tokens или query text.

## Epoch checks

Для valid delta должны совпадать:

- database OID;
- postmaster start;
- database `stats_reset`;
- WAL `stats_reset`;
- candidate table OID;
- candidate index OID;
- candidate index definitions;
- uniqueness contract.

Оба candidate indexes должны быть valid и ready.

## Monotonic counters

Evaluator проверяет, что counters не уменьшились.

Database:

- transactions;
- blocks read/hit;
- tuples returned/fetched/inserted/updated/deleted;
- temp files/bytes;
- deadlocks.

WAL:

- records;
- FPI;
- bytes;
- buffers full;
- writes;
- syncs.

Candidate table:

- seq/index scans;
- tuples read/fetched;
- insert/update/delete/HOT update counters.

Candidate indexes:

- scans;
- tuples read;
- tuples fetched.

Уменьшение любого monotonic counter инвалидирует window.

## Size deltas

Размеры могут уменьшаться из-за vacuum/rewrite/other physical effects, поэтому evaluator не использует их как epoch invalidation.

Он возвращает signed deltas для:

- table heap bytes;
- total relation bytes;
- каждого candidate index.

Size delta не доказывает экономию от удаления индекса.

## Valid report

При совпадающем epoch:

`delta_valid_same_epoch_evidence_not_representative`

Report содержит:

- epoch identity;
- database deltas;
- global WAL deltas;
- candidate table deltas;
- candidate index deltas;
- signed relation-size deltas.

Обязательные interpretation flags остаются false:

- representative authenticated workload proven;
- candidate read benefit proven;
- production candidate write cost proven;
- global WAL attributable to candidate;
- production index removal ready;
- automatic DDL decision.

## Invalid report

При restart/reset/OID/definition/counter/privacy drift:

`observation_window_invalidated_restart_capture_required`

Report содержит:

- `window_valid=false`;
- `deltas_trusted=false`;
- список invalidation reasons;
- все delta sections равны `null`;
- `production_index_removal_ready=false`.

После invalidation нужен новый baseline capture. Старый и новый epoch нельзя склеивать.

## Self-test matrix

Workflow проверяет 11 сценариев:

1. same epoch и monotonic counters — valid;
2. postmaster restart — invalid;
3. database stats reset — invalid;
4. WAL stats reset — invalid;
5. candidate index OID drift — invalid;
6. candidate definition drift — invalid;
7. candidate index not ready — invalid;
8. counter decrease — invalid;
9. PII marker — invalid;
10. business rows marker — invalid;
11. query text marker — invalid.

## Decision policy

Evaluator не делает автоматических performance или DDL выводов.

- Positive single-index scan delta не доказывает latency necessity.
- Zero single-index scan delta не доказывает redundancy.
- Global WAL delta нельзя приписывать candidate index.
- Table write deltas не равны write cost конкретного индекса.
- Valid delta не доказывает representative workload.
- Valid delta не разрешает benchmark.
- Valid delta не разрешает DROP INDEX.

Дополнительно обязательны:

- approved observation cadence и thresholds;
- representative authenticated workload assessment;
- production `EXPLAIN ANALYZE` на approved non-PII fixtures;
- production-scale benchmark в разрешённой disposable/isolated среде;
- authenticated regression;
- exact forward/rollback migration;
- separate owner production DDL approval.

## Source contract

- config: `config/nav-v2-index-observation-delta-evaluator-v1.json`;
- evaluator: `scripts/evaluate_nav_v2_index_observation_delta_v1.py`;
- checker: `scripts/check_nav_v2_index_observation_delta_evaluator_v1.py`;
- workflow: `.github/workflows/nav-v2-index-observation-delta-evaluator-v1.yml`.

Workflow выполняет только local compile, source validation и self-test.

## Границы

Не выполняются:

- production SQL;
- statistics reset/settings changes;
- synthetic production workload;
- branch creation или cost confirmation;
- account/secret creation;
- index DDL;
- migration apply;
- изменения `leader_*`.
