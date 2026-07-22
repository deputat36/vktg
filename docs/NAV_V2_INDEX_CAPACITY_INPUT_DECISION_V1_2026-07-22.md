# Navigator v2 — Index capacity-input decision form v1

Дата: 22 июля 2026 года.

## Цель

Подготовить однозначную форму для будущего решения по масштабу observation window и production-scale FK benchmark для:

`nav_deal_answers_v2_deal_idx (deal_id)`.

Values are not selected. Документ не заполняет поля вместо владельца и не разрешает execution.

## Решение

`capacity_input_decision_form_prepared_unsubmitted_execution_blocked`

Текущее состояние:

- `decision_form.status=unsubmitted`;
- `selected_environment=null`;
- `benchmark_execution_authorized=false`;
- `cloud_execution_allowed=false`;
- `production_dml_authorized=false`;
- `production_ddl_authorized=false`;
- `production_index_removal_ready=false`;
- owner approval отсутствует;
- release-manager approval отсутствует.

## Зачем нужна форма

Production-scale benchmark protocol уже определён, но его параметры нельзя угадывать. До отдельного решения отсутствуют:

- разрешённая среда;
- target deals и answers;
- answers-per-deal distribution;
- peak concurrency и headroom;
- compute class;
- maximum runtime;
- cadence observation window;
- minimum completion thresholds.

Эта форма собирает решения в одном месте и исключает неявное использование исторических значений.

## Fixed context

Эти параметры уже заданы upstream contract и не выбираются повторно:

- planning horizon — 12 месяцев;
- PostgreSQL major — 17;
- comparison modes — single+composite и composite-only;
- production database для benchmark запрещена;
- production rows нельзя копировать;
- реальные аккаунты и direct identifiers запрещены;
- disposable preview branch — максимум 6 часов.

## Поля решения

| Поле | Допустимый формат | Текущее значение |
|---|---|---|
| Environment | isolated PostgreSQL 17 или owner/cost-approved disposable Supabase preview branch | `null` |
| Target scale source | owner forecast, approved non-PII aggregate observation или максимум из двух | `null` |
| Target deals | positive integer | `null` |
| Target answers | positive integer | `null` |
| Answers per deal | object: p50, p95, max_bounded | `null` |
| Peak concurrency | positive integer | `null` |
| Concurrency headroom | additional workers, positive integer | `null` |
| Branch compute class | fresh Supabase cost response, только для preview | `null` |
| Maximum runtime | positive minutes | `null` |
| Observation cadence | daily, weekly, before/after known release | `null` |
| Minimum observation days | positive integer | `null` |
| Minimum authenticated sessions | non-negative integer | `null` |
| Minimum candidate index reads | non-negative integer | `null` |
| Minimum candidate table writes | non-negative integer | `null` |
| Minimum parent mutations | non-negative integer | `null` |

Distribution должна выполнять:

`p50 <= p95 <= max_bounded`.

Zero thresholds технически допустимы только с отдельным явным rationale. Ноль не должен появляться как default.

## Environment choice

Допустимы только два значения.

### Isolated ephemeral PostgreSQL 17

Подходит для воспроизводимого synthetic benchmark без Supabase branch.

Не заменяет authenticated Supabase regression и не доказывает production latency.

### Disposable Supabase preview branch

Требует отдельного fresh cost gate:

- повторно получить актуальную стоимость;
- показать владельцу amount, currency и recurrence;
- получить explicit owner cost approval;
- вызвать `confirm_cost`;
- сохранить `cost_confirmation_id`;
- установить automatic delete deadline;
- удалить branch не позднее 6 часов;
- не использовать production rows и реальные accounts.

Historical cost нельзя считать fresh cost или подтверждением.

## Current cost state

- `cost_rechecked=false`;
- `amount=null`;
- `currency=null`;
- `recurrence=null`;
- `shown_to_owner=false`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `automatic_delete_deadline=null`.

Форма не вызывает cost tools и не создаёт branch.

## Submission validation

Форма считается корректно заполненной, только если одновременно:

1. все required values заполнены;
2. numeric types и minimum values корректны;
3. distribution ordering корректен;
4. environment-specific требования выполнены;
5. preview fresh cost gate выполнен, если выбран preview;
6. observation thresholds явно утверждены;
7. owner approval записан;
8. release-manager approval записан.

Сейчас все validation flags равны `false`.

## Что происходит после заполнения

Даже valid form не разрешает execution автоматически.

Остаются отдельные gates:

- fresh read-only schema/statistics preflight;
- проверка observation epoch или явный restart окна;
- separate benchmark execution authorization;
- disposable environment creation, если выбрана;
- synthetic dataset manifest и hash;
- cleanup evidence;
- authenticated regression;
- production `EXPLAIN ANALYZE` на approved non-PII fixtures;
- exact forward/rollback migration;
- separate owner production DDL approval.

## Что форма не делает

Форма:

- не выбирает значения;
- не подтверждает стоимость;
- не создаёт environment;
- не создаёт accounts или secrets;
- не запускает benchmark;
- не запускает production workload;
- не разрешает production DML;
- не разрешает production DDL;
- не делает `DROP INDEX` готовым.

## Active stops

- form unsubmitted;
- environment missing;
- target scale missing;
- distribution missing;
- concurrency missing;
- runtime missing;
- observation cadence missing;
- observation thresholds missing;
- preview cost gate missing, если будет выбран preview;
- benchmark execution not authorized;
- authenticated regression missing;
- production migration missing;
- owner DDL approval missing.

## Source contract

Канонический файл:

`config/nav-v2-index-capacity-input-decision-v1.json`

Validator:

`scripts/check_nav_v2_index_capacity_input_decision_v1.py`

Workflow выполняет только JSON/source validation. Он не вызывает Supabase, SQL, cost или branch actions.

## Границы

Production Supabase, Auth, RLS, grants, Edge, indexes и migrations не меняются.

Запрещено:

- угадывать capacity/concurrency values;
- использовать historical branch cost как fresh confirmation;
- подтверждать стоимость без отдельного owner decision;
- создавать Supabase branch;
- создавать test accounts или secrets;
- запускать benchmark на production;
- копировать production rows;
- удалять production index;
- применять production migration;
- менять `leader_*`.
