# Navigator v2 — FK parent mutation benchmark v1

Дата: 21 июля 2026 года.

## Цель

Проверить в изолированном PostgreSQL 17, сохраняет ли composite unique index `(deal_id, question_key)` структурную пригодность для foreign-key child lookup после удаления только synthetic single-column index `(deal_id)`.

Это repository-only evidence для дальнейшего анализа `nav_deal_answers_v2_deal_idx`. Оно не является production benchmark, migration или разрешением удалить индекс.

## Read-only production FK contract

Aggregate-only Supabase query подтвердила:

- constraint: `nav_deal_answers_v2_deal_id_fkey`;
- child column: `deal_id`;
- parent: `nav_deals_v2(id)`;
- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- constraint validated;
- constraint не deferrable;
- PII не возвращалась;
- production rows и schema не менялись.

Synthetic schema повторяет эти actions.

## Synthetic comparison modes

Один PostgreSQL 17 transaction использует только schema `harness` и generated data:

- 5 002 parent deals;
- 5 000 referenced deals;
- 20 answer rows на каждый referenced deal;
- 100 000 answer rows;
- два unreferenced parent deals для successful update cases.

Сравниваются два режима:

1. `single_and_composite_indexes` — существуют `(deal_id)` и unique `(deal_id, question_key)`;
2. `composite_unique_index_only` — synthetic `(deal_id)` удалён, unique composite остаётся.

## Parent delete cascade

В каждом режиме удаляется отдельный referenced parent.

Проверяется:

- parent удалён;
- ровно 20 child answer rows удалены cascade;
- transaction-local child index scan зафиксирован;
- в composite-only режиме scan относится к composite unique index;
- single-column index действительно отсутствует во втором режиме.

## Parent update

В каждом режиме выполняются два сценария:

1. unreferenced parent key update должен завершиться успешно;
2. referenced parent key update должен завершиться `23503 foreign_key_violation`, потому что production contract использует `ON UPDATE NO ACTION`.

Проверяется, что blocked update не меняет parent key и не удаляет child rows.

## Transaction-local index attribution

Harness использует `pg_stat_xact_user_indexes`, а не production `idx_scan`.

Для каждой mutation сохраняются:

- scan counters до и после;
- delta single-column index;
- delta composite unique index;
- parent/child counts до и после;
- `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` для successful mutations;
- diagnostic elapsed time для blocked mutations;
- synthetic index sizes.

Latency сохраняется только как CI evidence. Harness не сравнивает latency ratio и не утверждает, что один вариант быстрее в production.

## Результат, который должен доказать CI

- composite unique index обслуживает structural `deal_id` lookup;
- composite-only `ON DELETE CASCADE` сохраняет корректную семантику;
- composite-only update без children проходит;
- composite-only referenced update остаётся blocked;
- итоговые counts соответствуют двум cascade delete и двум successful key update;
- все generated objects исчезают после rollback.

## Decision remains review-only

Решение по `nav_deal_answers_v2_deal_idx` остаётся:

`review_possible_redundancy_only`

Synthetic evidence уменьшает неопределённость, но не разрешает production index removal.

## Active production stops

До любого production DDL всё ещё обязательны:

- известное начало observation window;
- representative authenticated workload;
- production `EXPLAIN ANALYZE` на безопасных non-PII cases;
- production FK parent update/delete benchmark;
- production write-cost и storage benefit estimate;
- authenticated regression suite;
- exact forward/rollback migration;
- отдельное owner approval на production DDL.

## No production DDL

Запрещено использовать этот harness как основание для:

- `DROP INDEX` в production;
- автоматической migration;
- изменения RLS;
- копирования production data;
- создания платной Supabase branch;
- утверждения production performance.

## Production remains unchanged

В рамках этой работы:

- production index не удалялся;
- migrations не применялись;
- Supabase branch не создавалась;
- Auth, RLS, grants и Edge Functions не менялись;
- Navigator business rows не менялись;
- `leader_*` не затрагивался.
