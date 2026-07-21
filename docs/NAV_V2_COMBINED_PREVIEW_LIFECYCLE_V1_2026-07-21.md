# Navigator v2 — Combined Preview Lifecycle v1

Дата: 21 июля 2026 года.

## Combined lifecycle

Цель — доказать совместимость трёх repository-only SQL-компонентов в одной PostgreSQL 17 базе:

`privacy quality → consolidated bounded tasks → governed intake 25-rule mapper`

До этой волны каждый компонент проходил собственный изолированный harness. Это не доказывало отсутствие конфликтов при совместном применении.

Production remains unchanged.

- Supabase branch не создаётся;
- cost confirmation не выполняется;
- SQL не применяется в cloud;
- generated SQL не записывается в `supabase/migrations`;
- Edge Function не деплоится;
- Auth, RLS и grants не меняются;
- technical accounts не создаются;
- production data и `leader_*` не меняются;
- `preview_apply_allowed=false`;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`.

## Shared synthetic schema

Независимые harness setup-файлы нельзя запускать последовательно: они повторно создают роли, schemas, enums и базовые таблицы.

Combined lifecycle использует:

1. production-like quality harness как единственную базовую схему;
2. `nav_v2_combined_preview_shared_setup_v1.sql` как bounded/DTO overlay;
3. intake mock/setup-функции без повторного создания ролей и business tables.

Shared overlay добавляет:

- `auth.uid()`;
- profile fields `full_name` и `manager_id`;
- enum `nav_v2_side`;
- production-like document, risk и event tables;
- DTO permission helpers;
- расширенный task type constraint;
- отдельные synthetic users, profiles, deals и legacy task.

Bounded fixtures заполняют все quality-sensitive поля, чтобы quality trigger не создавал ложный backlog.

## Forward order

1. `01-quality-forward.sql`;
2. `01-bounded-consolidated-forward.sql`;
3. `04-intake-forward.sql`.

Quality assertions выполняются до bounded fixtures.

Bounded coexistence assertions проверяют:

- actor-aware create/start/complete;
- audit actor;
- evidence и confirmed outcome;
- contract-aware DTO;
- ролевые действия юриста;
- отсутствие создания documents/risks;
- отсутствие изменения quality tasks;
- сохранность legacy task.

После intake apply повторно выполняются существующие:

- adapter contract/scenarios;
- save integration scenarios;
- governed request ledger lifecycle;
- wave1 rules;
- wave2 rules;
- special semantics;
- final 25-rule single/composite assertions.

Cross-component assertions проверяют одновременное существование quality, bounded и intake contracts, privacy DTO, service-role boundaries и отсутствие побочных writes от pure intake adapter.

## Conflict inventory

`scripts/check-nav-v2-combined-preview-artifacts-v1.mjs` читает exact upstream indexes и проверяет:

- artifact SHA-256 и byte sizes;
- точный forward/rollback order;
- отсутствие duplicate source paths;
- create table/type/index/trigger collisions;
- exact function redefinitions.

Допустимо только ожидаемое последовательное переопределение:

`public.nav_v2_get_deal_card_lite(uuid)`

Сначала устанавливается explicit privacy DTO, затем bounded overlay расширяет его contract-aware task fields.

Любое другое exact function redefinition или duplicate created object завершает workflow ошибкой.

## PostgreSQL 17

Workflow запускает реальный PostgreSQL 17 container и выполняет:

1. shared synthetic setup;
2. quality apply и assertions;
3. bounded consolidated apply и coexistence assertions;
4. intake support setup;
5. intake full apply;
6. полный existing 25-rule assertion chain;
7. cross-component integration assertions;
8. ALWAYS ROLLBACK в обратном порядке;
9. post-rollback assertions.

## ALWAYS ROLLBACK

Rollback order:

1. intake rollback;
2. bounded consolidated rollback;
3. quality exact rollback.

Rollback запускается даже при ошибке после любого успешно применённого компонента.

Post-rollback проверяется:

- bounded columns отсутствуют;
- mutation event table отсутствует;
- actor-aware RPC отсутствуют;
- governed intake ledger отсутствует;
- intake private functions отсутствуют;
- explicit lite DTO baseline сохранён;
- original quality function и trigger восстановлены по exact MD5 snapshot;
- privacy quality helper удалён;
- legacy synthetic task сохранён.

## Active stops

Даже при зелёном combined lifecycle остаются:

- preview branch отсутствует;
- explicit cost approval отсутствует;
- cost confirmation id отсутствует;
- technical accounts отсутствуют;
- authenticated role matrix не выполнена;
- Edge feature flag выключен;
- Edge candidate не deployed;
- preview apply не approved;
- production deployment не approved;
- release baseline migration drift не reconciled;
- controlled pilot не approved;
- cleanup option не выбран.

Успешный PostgreSQL 17 lifecycle не является разрешением на Supabase branch или deployment.

## Rollback репозитория

Для отмены этой repository-only волны удалить:

- combined lifecycle config;
- shared setup и combined assertions;
- artifact checker;
- lifecycle runner;
- workflow;
- этот документ.

Production rollback не требуется, потому что production Supabase не менялся.
