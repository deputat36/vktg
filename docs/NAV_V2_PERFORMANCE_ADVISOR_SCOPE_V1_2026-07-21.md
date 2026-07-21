# Navigator v2 — Performance Advisor scope v1

Дата read-only capture: 21 июля 2026 года, `13:38:36 UTC`.

## Performance Advisor

Supabase Performance Advisor работает на уровне общего project и смешивает Navigator v2 с `leader_*`, `parket_*`, `broker_*` и legacy `nav_*`.

Цель этого среза — выделить только production tables Navigator v2 и запретить опасные автоматические действия по одному признаку `idx_scan=0`.

Production remains unchanged.

- индексы не удалялись;
- новые индексы не создавались;
- RLS и policies не менялись;
- DDL и DML не выполнялись;
- migrations не применялись;
- branch и technical accounts не создавались;
- Auth, grants, Edge и production data не менялись;
- `leader_*` не изменялись.

## Read-only evidence

`tests/sql/nav_v2_performance_readonly_preflight_v1.sql` выполняет aggregate-only чтение внутри `begin transaction read only` и заканчивается `rollback`.

Scope:

- `nav_user_profiles`;
- 10 таблиц, соответствующих `^nav_.*_v2$`;
- всего 11 production tables.

Captured summary:

- indexes: `53`;
- foreign keys: `29`;
- foreign keys without covering index: `0`;
- RLS policies: `32`;
- policies with SELECT-wrapped Auth function: `32`;
- policies with direct per-row Auth call: `0`;
- zero-scan non-constraint indexes: `13`;
- zero-scan indexes supporting foreign keys: `12`;
- zero-scan non-FK indexes: `1`;
- total size of zero-scan indexes: `212992` bytes;
- known statistics reset timestamp: отсутствует;
- representative observation window: не доказано.

Запрос не возвращает ФИО, email, телефоны, адреса, UUID пользователей или клиентские данные.

## Zero-scan classification

`idx_scan=0` не означает, что индекс безопасно удалить.

12 из 13 zero-scan индексов покрывают внешние ключи или их leading columns:

- `nav_deal_answers_v2_created_by_idx`;
- `nav_deal_answers_v2_deal_idx`;
- `nav_deal_comments_v2_author_id_idx`;
- `nav_deal_comments_v2_deal_created_idx`;
- `nav_deal_events_v2_actor_id_idx`;
- `nav_deal_participants_v2_edit_lookup_idx`;
- `nav_deal_participants_v2_view_lookup_idx`;
- `nav_deal_reviews_v2_reviewer_id_idx`;
- `nav_deal_risks_v2_resolved_by_idx`;
- `nav_deal_tasks_v2_created_by_idx`;
- `idx_nav_user_profiles_invited_by`;
- `nav_user_profiles_manager_idx`.

Их удаление может ухудшить parent update/delete checks, permission lookups, audit filters или будущую нагрузку. Advisor не измеряет все эти риски.

Единственный non-FK zero-scan индекс:

`nav_user_profiles_role_idx`

Он остаётся review-only, потому что role filters используются в user-management и administrative routes. До authenticated workload и `EXPLAIN ANALYZE` удаление запрещено.

Отдельно `nav_deal_answers_v2_deal_idx` может выглядеть потенциально избыточным относительно unique `(deal_id, question_key)`, но решение требует query plan, FK impact benchmark и rollback rehearsal. Автоматический drop запрещён.

## RLS evidence

Все 11 scope tables имеют RLS.

Для 32 policies:

- Auth function references присутствуют;
- 32 используют SELECT-wrapped форму;
- direct per-row Auth calls: `0`.

Следовательно, project-wide Advisor warnings по legacy tables нельзя автоматически переносить на v2 policies. Автоматическая переработка Navigator RLS в этом срезе запрещена.

## No automatic DDL

Индекс может стать кандидатом на удаление только после полного evidence package:

1. известная дата сброса статистики или контролируемое начало наблюдения;
2. representative authenticated workload window;
3. `EXPLAIN ANALYZE` до и после для затронутых запросов;
4. проверка parent update/delete по внешнему ключу;
5. оценка write amplification и реальной экономии storage;
6. authenticated regression tests;
7. exact rollback SQL;
8. отдельное owner approval на production DDL.

Даже выполнение этих пунктов создаёт review candidate, а не автоматическое разрешение на production migration.

## Active stops

- statistics reset timestamp неизвестен;
- representative workload window отсутствует;
- authenticated query-plan evidence отсутствует;
- FK parent update/delete benchmark отсутствует;
- owner approval на index removal отсутствует;
- production DDL не approved.

## CI contract

Проверяются:

- exact captured counts;
- exact 13-index inventory;
- 12 FK-support и 1 non-FK classification;
- total byte size;
- RLS coverage и SELECT-wrapped Auth count;
- fail-closed decision policy;
- read-only SQL source;
- отсутствие DDL/DML и generated migrations;
- отсутствие cloud mutation commands в workflow.

Workflow формирует deterministic SHA-256 evidence artifact.

## Следующий безопасный шаг

Без отдельного approval разрешено только:

- повторять read-only capture после накопления representative workload;
- сопоставлять индексы с конкретными production queries;
- готовить repository-only `EXPLAIN` plans на synthetic PostgreSQL fixtures;
- не удалять индексы и не менять RLS.

Production changes требуют отдельного решения владельца и не входят в generic-команду `продолжай`.
