# Navigator v2 — FK parent mutation attribution v1

Дата: 21 июля 2026 года.

## FK parent mutation attribution

Этот slice расширяет уже смерженное synthetic FK parent-mutation evidence для кандидата:

`nav_deal_answers_v2_deal_idx (deal_id)`

Он не повторяет полный benchmark и не меняет его решение. Цель — показать, какой child index получает transaction-local scans во время реальных FK mutations, зафиксировать synthetic index sizes и отдельно проверить запрещённое изменение referenced parent key.

## Canonical evidence extended, not duplicated

Канонические источники остаются:

- `config/nav-v2-index-fk-parent-mutation-evidence-v1.json`;
- `tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql`;
- `docs/NAV_V2_INDEX_FK_PARENT_MUTATION_EVIDENCE_V1_2026-07-21.md`.

Они уже доказывают:

- actual `DELETE CASCADE`;
- successful `UPDATE NO ACTION` child lookup;
- equivalence двух index modes;
- trigger evidence;
- unaffected result hash;
- полный rollback.

Новый companion harness добавляет только отсутствующее evidence и не создаёт параллельный production decision package.

## Transaction-local index scans

Harness использует:

`pg_stat_xact_user_indexes`

Это позволяет сравнить index scan counters внутри текущей synthetic transaction без зависимости от глобальной статистики runner.

Для каждого successful mutation сохраняются:

- scan counter single-column index до и после;
- scan counter composite unique index до и после;
- delta каждого индекса;
- наличие или отсутствие single-column index;
- parent/child counts до и после.

Сравниваются режимы:

1. `single_and_composite_indexes`;
2. `composite_unique_index_only`.

В composite-only режиме обязательны положительные scan deltas unique `(deal_id, question_key)` для:

- parent `DELETE CASCADE`;
- parent key UPDATE без child rows.

## Synthetic index sizes

До synthetic удаления single-column index сохраняются:

- `pg_relation_size` single `(deal_id)` index;
- `pg_relation_size` composite unique `(deal_id, question_key)` index.

Размеры относятся только к generated dataset из 100 000 child rows. Они не являются production storage estimate и не используются для расчёта экономии.

## Referenced parent update rejection

Production FK contract использует:

- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`.

Поэтому отдельно проверяются два referenced parent key update:

1. при наличии обоих child indexes;
2. после synthetic удаления single `(deal_id)` index.

Оба должны завершиться:

`SQLSTATE 23503 foreign_key_violation`

После ошибки:

- старый parent key остаётся;
- новый parent key отсутствует;
- child rows сохраняются;
- transaction продолжается и формирует evidence.

## Composite-only result

В режиме только composite unique index harness должен подтвердить:

- structural `deal_id` lookup использует leading prefix composite index;
- parent delete удаляет ровно 20 child rows;
- unreferenced parent update проходит;
- referenced parent update блокируется;
- single-column index отсутствует;
- composite transaction-local scan delta положителен для successful FK checks.

## Decision remains review-only

Каноническое решение не меняется:

`synthetic_fk_parent_mutation_gap_closed_production_drop_not_ready`

Состояние кандидата остаётся:

`review_possible_redundancy_only`

Новый evidence не означает, что production index безопасно удалить.

## Active stops

До production DDL всё ещё отсутствуют:

- известное начало production statistics window;
- representative authenticated workload;
- production `EXPLAIN ANALYZE` на безопасных non-PII cases;
- production-scale parent UPDATE/DELETE benchmark;
- production write-cost и storage-benefit estimate;
- authenticated regression suite;
- exact forward/rollback migration;
- отдельное owner approval.

## No production DDL

В рамках этого slice запрещены:

- `DROP INDEX` в production;
- создание или применение migration;
- Supabase preview branch;
- копирование production data;
- изменение RLS или grants;
- утверждение, что synthetic latency равна production latency.

## Production remains unchanged

- production indexes не менялись;
- Navigator rows не менялись;
- Auth settings и users не менялись;
- Edge Functions не развёртывались;
- migrations не применялись;
- `leader_*` не затрагивался;
- вся synthetic schema удаляется полным transaction rollback.
