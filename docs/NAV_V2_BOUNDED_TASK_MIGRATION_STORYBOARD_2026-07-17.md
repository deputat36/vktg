# Navigator v2 — bounded task migration storyboard

Дата: 17 июля 2026 года.

Статус: repository-only storyboard, not a migration. В этом slice файл в `supabase/migrations` не создаётся и SQL к production не применяется.

## Назначение

Storyboard описывает будущий единый database boundary для bounded-задач до момента, когда владелец отдельно разрешит migration PR и non-production authenticated E2E.

Будущее условное имя:

`YYYYMMDDHHMMSS_nav_v2_bounded_task_contract_and_runtime.sql`

Это только placeholder. Файл не создан.

## Production attestation

Read-only проверка проекта `ofewxuqfjhamgerwzull` зафиксировала:

- PostgreSQL 17.6;
- `nav_deal_tasks_v2` содержит только 17 legacy columns;
- присутствуют только 7 legacy constraints;
- существуют legacy RPC `nav_v2_add_task`, `nav_v2_update_task_status`, `nav_v2_get_deal_card_lite`;
- authenticated имеет EXECUTE на legacy add/status RPC;
- bounded columns, event table и governed RPC отсутствуют;
- информационно: 98 задач и 23 сделки.

Columns, constraints, signatures, grants и отсутствие partial deployment являются строгим structural gate. Counts могут меняться от нормальной работы и не являются строгим gate.

## Read-only preflight

`tests/sql/nav_v2_bounded_task_production_preflight_read_only.sql` должен выполняться только внутри:

```sql
begin transaction read only;
-- preflight SELECT/WITH statements
rollback;
```

Preflight останавливает будущий migration PR, если:

- major PostgreSQL version не 17;
- legacy columns отличаются;
- legacy constraints отличаются;
- legacy RPC signature отсутствует;
- legacy authenticated grant отличается от attestation;
- найден хотя бы один bounded column, table или RPC;
- обнаружен partial deployment.

Preflight не содержит DDL, DML, `GRANT`, `REVOKE`, `DO`, `CALL` или mutation function calls.

## Object diff

### Additive columns

Base contract добавляет nullable columns:

- `task_contract_version`;
- `completion_criterion_code`;
- `evidence_kind`;
- `evidence_reference_id`;
- `evidence_confirmed_at`;
- `gate_scope`;
- `outcome_code`;
- `outcome_state`;
- `outcome_reason_code`;
- `outcome_review_date`;
- `outcome_replacement_task_id`.

Mutation overlay добавляет:

- `subject_kind`;
- `subject_reference_id`;
- `outcome_proposed_by`;
- `outcome_proposed_at`;
- `outcome_decided_by`;
- `outcome_decided_at`.

Все поля nullable для legacy rows. DML/backfill отсутствует.

### Constraints

Bounded constraints добавляются `NOT VALID`. Они проверяют новые и изменяемые rows, но initial migration не сканирует и не преобразует 98 legacy tasks.

Legacy `nav_deal_tasks_v2_task_type_check` заменяется расширенным bounded-aware constraint и восстанавливается staged rollback.

### Audit table

Создаётся `public.nav_deal_task_mutation_events_v2`:

- unique `client_request_id`;
- RLS enabled;
- governed audit lifecycle;
- authenticated/anon direct read запрещён;
- service_role access разрешён.

### Governed RPC

Планируемые public signatures:

- `nav_v2_create_bounded_tasks(uuid,jsonb,uuid)`;
- `nav_v2_start_bounded_task(uuid,uuid)`;
- `nav_v2_complete_bounded_task(uuid,uuid,uuid)`;
- `nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)`;
- `nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)`;
- `nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)`.

Все governed RPC остаются service-role-only до отдельного Edge deployment и authenticated evidence.

### Legacy RPC transition

Production сейчас выдаёт authenticated EXECUTE на `nav_v2_add_task` и `nav_v2_update_task_status`.

Prototype overlay переводит их в service-role-only и добавляет guards:

- generic add запрещён;
- legacy status RPC не меняет contract-v2 rows.

Этот переход является отдельным STOP/GO decision. Его нельзя выполнять раньше согласованного Edge/frontend cutover и настоящего authenticated E2E.

### Lite DTO

Будущий migration boundary сначала устанавливает explicit DTO v1, затем bounded-aware DTO v2. Это даёт детерминированную базу и доказанный rollback v2 → v1.

## Migration phases

### Phase 0 — preflight

Только read-only structural checks. Любой structural drift = STOP.

### Phase 1 — additive schema

Применяется bounded base contract:

- nullable columns;
- catalog/suggestion helpers;
- `NOT VALID` constraints;
- no backfill.

### Phase 2 — governed mutation layer

Применяется mutation overlay:

- audit event table;
- private idempotency/subject/reason helpers;
- governed RPC;
- service-role-only grants;
- bounded-aware legacy guards.

### Phase 3 — legacy grant transition

Отдельное решение внутри будущего migration PR:

- подтвердить Edge-mediated transport;
- подтвердить authenticated E2E;
- revoke authenticated direct EXECUTE на legacy add/status только после cutover evidence.

Без этого решения migration = STOP.

### Phase 4 — explicit DTO baseline

Устанавливается `nav_v2_get_deal_card_lite` DTO v1.

### Phase 5 — bounded DTO overlay

Устанавливается DTO v2 с contract permissions и privacy-minimized fields.

### Phase 6 — verification

Проверяются schema, functions, grants, RLS, no-backfill, process separation, DTO privacy и advisors.

### Phase 7 — Edge integration

Deferred. Не входит в database migration storyboard и требует отдельного deploy approval.

### Phase 8 — frontend transport

Deferred до database + Edge + authenticated evidence + controlled pilot.

## Grant policy

### Governed RPC

- GRANT: `service_role`;
- REVOKE: `PUBLIC`, `anon`, `authenticated`.

### Legacy RPC

Текущий production факт: authenticated EXECUTE включён.

Future target из prototype: service-role-only. Переход нельзя считать автоматически утверждённым только потому, что PG17 dry-run зелёный.

Final grant policy требует отдельного решения владельца и реального application E2E.

## STOP conditions

Будущий migration PR немедленно останавливается, если:

1. PostgreSQL major version не 17;
2. task columns/constraints отличаются от attestation;
3. найден partial bounded deployment;
4. governed RPC уже существует;
5. legacy RPC signature/grant drifted;
6. PR #384 dry-run не зелёный;
7. нет owner approval на migration PR;
8. Issue #282 cost approval и authenticated E2E отсутствуют;
9. final grants не утверждены;
10. rollback owner/window не назначены;
11. backup/recovery readiness не подтверждена.

## GO decisions

Сейчас разрешён только repository storyboard.

Production migration GO возможен только после закрытия всех STOP conditions отдельным явным решением. Зелёные synthetic tests не являются deployment approval.

## Post-apply verification

Будущий deploy должен подтвердить:

- exact columns/constraints/table/functions;
- mutation event RLS;
- fixed `search_path` у security-definer RPC;
- service_role governed EXECUTE;
- отсутствие governed EXECUTE у public/anon/authenticated;
- approved legacy grant transition;
- legacy rows остаются `task_contract_version is null`;
- отсутствует массовый backfill;
- deal/document/risk snapshots не изменились;
- task trigger count не изменился;
- DTO v2 privacy/permission contract;
- Supabase security advisor review;
- Supabase performance advisor review;
- Edge ещё не deployed до отдельного approval.

## Staged rollback

Порядок уже доказан PR #384:

1. DTO v2 → explicit DTO v1;
2. mutation overlay → удалить governed objects и восстановить legacy RPC/grants;
3. base contract → удалить bounded columns/catalog/constraints и восстановить legacy task type constraint.

Rollback проверяет legacy rows, RPC, grants, DTO v1 и отсутствие bounded objects.

## Что storyboard запрещает

- создавать файл в `supabase/migrations`;
- применять SQL к production;
- создавать Supabase branch;
- менять Auth/RLS/grants;
- deploy Edge Function;
- включать bounded transport;
- backfill legacy tasks;
- объявлять систему deployment-ready.

Issue #282 остаётся обязательным cost gate. Generic «продолжай» не является approval.

## Production boundary

Production использован только для read-only attestation. В этом PR отсутствуют Management API writes, DDL/DML, Auth users, grants/RLS changes, Edge deployment и task-row changes.

## CI

Workflow должен:

1. доказать отсутствие новых/изменённых файлов под `supabase/migrations`;
2. проверить storyboard, attestation и object diff;
3. доказать отсутствие mutation SQL в preflight;
4. создать synthetic legacy environment в PostgreSQL 17;
5. выполнить preflight в `TRANSACTION READ ONLY`;
6. сравнить structural snapshot до и после;
7. загрузить evidence.

## Rollback storyboard PR

Repository rollback:

- удалить storyboard/attestation/object diff;
- удалить read-only preflight/checker/workflow/docs.

Production rollback не требуется: production state не меняется.
