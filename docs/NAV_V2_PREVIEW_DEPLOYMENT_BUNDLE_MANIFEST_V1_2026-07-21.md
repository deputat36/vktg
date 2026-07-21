# Navigator v2 — preview deployment bundle manifest v1

Дата: 21 июля 2026 года.

## Назначение

Документ сводит repository-only источники Navigator v2 в один проверяемый порядок будущего развёртывания на disposable preview branch.

Это не migration, не Edge deployment и не разрешение на создание Supabase branch.

Текущее состояние:

- полный structural catalog — 25 supported / 0 unsupported;
- source inventory собран;
- production migration files не созданы;
- production rollback bundle не подготовлен;
- Edge identity handler остаётся detached;
- bounded frontend transport выключен;
- authenticated E2E не выполнен;
- deployment option и cleanup option не выбраны.

`repository_source_inventory_complete=true`, но `deployment_bundle_ready=false`.

## Cost gate

Read-only cost snapshot от 21 июля 2026 года:

- `0.01344` в час;
- шестичасовой ceiling `0.08064`;
- connector не вернул валюту;
- explicit approval отсутствует;
- `cost_confirmation_id=null`;
- branch creation запрещён.

Перед будущим `confirm_cost` стоимость проверяется повторно.

## Ordered layers

### 0. Read-only preflight

Проверяются current main SHA, PostgreSQL 17, production counts, отсутствие prototype objects, текущая migration head и актуальная стоимость branch.

Записи запрещены.

### 1. Privacy-aligned quality replacement

Порядок repository sources:

1. `supabase/prototypes/nav_v2_privacy_aligned_quality_completeness_v1.sql`
2. `supabase/prototypes/nav_v2_privacy_aligned_quality_task_author_v1.sql`

PostgreSQL 17 rehearsal и exact snapshot rollback существуют в `tests/sql`, но это ещё не production migration/rollback bundle.

Нельзя выполнять mass backfill или cleanup legacy tasks.

### 2. Bounded tasks и actor identity

Порядок задаёт `config/nav-v2-bounded-task-migration-storyboard.json`:

1. additive task contract;
2. governed mutations;
3. actor-aware overloads с `p_actor_id`;
4. legacy RPC transition после authenticated E2E;
5. explicit DTO v1;
6. bounded DTO v2.

Не утверждены:

- legacy RPC cutover;
- final grants policy;
- production migration;
- production rollback;
- bounded transport.

### 3. Governed intake и full 25-rule mapper

Сборка требует не одного SQL-файла, а dependency chain:

1. render canonical adapter из versioned catalog;
2. base legacy integration preview;
3. governed request ledger/write plan;
4. base production-schema mapper;
5. wave1 qualification/integration;
6. wave2 qualification/integration;
7. special qualification;
8. final 25/0 preview;
9. final production-schema mapper.

Все 25 fixtures и layered rollback доказаны в PostgreSQL 17. Однако существующие rollback-файлы являются rehearsal/harness rollback, а не утверждённым production rollback bundle.

### 4. Edge identity и action routes

Repository sources существуют:

- `task-action-contract-v2.js`;
- `task-action-edge-identity-v2.js`;
- текущий `index.ts`.

Текущий Edge `index.ts` не импортирует detached identity handler и продолжает использовать legacy user-RPC path через bearer token и publishable/anon key.

Поэтому:

- verified actor injection не интегрирован;
- actor-aware service-role RPC route не включён;
- Edge deployment не готов;
- service-role key в браузере запрещён;
- будущий Edge deploy обязан использовать `verify_jwt=true`.

### 5. Frontend flagged transport pilot

`task-action-guard-v2.js` содержит:

`const BOUNDED_TRANSPORT_ENABLED = false;`

Legacy runtime остаётся default path. Включение bounded transport допускается только после database + Edge + authenticated E2E и отдельного pilot approval.

### 6. Authenticated preview E2E

Требуемые роли:

- admin;
- manager;
- SPN;
- lawyer;
- broker;
- viewer.

Owner — только отдельный opt-in.

Разрешены только synthetic users/data. Production data, реальные клиенты, реальные адреса и реальные документы запрещены.

### 7. Optional legacy quality cleanup

Cleanup идёт последним и только после live privacy replacement.

Текущая классификация:

- 40 obsolete privacy-conflict tasks;
- 4 object-context replacements;
- 2 representation replacements.

`selected_cleanup_option=null`; cleanup запрещён.

## Active STOP

Bundle нельзя считать deployable, пока существуют:

- отсутствующий deployment option;
- отсутствующее cost approval и `cost_confirmation_id`;
- отсутствующий preview branch;
- отсутствие executable migrations;
- отсутствие production rollback bundle;
- detached Edge identity handler;
- выключенный bounded transport;
- отсутствие authenticated role matrix;
- отсутствие production deployment approval;
- отсутствие pilot scope;
- невыбранный cleanup option.

## Что manifest доказывает

Manifest доказывает только:

- все repository source paths известны;
- dependency order зафиксирован;
- текущие незакрытые gates видимы;
- ни один слой не разрешён к применению;
- production и preview Supabase не изменены.

Manifest не доказывает deployment readiness и не заменяет отдельные migration, Edge, E2E и rollback attestations.
