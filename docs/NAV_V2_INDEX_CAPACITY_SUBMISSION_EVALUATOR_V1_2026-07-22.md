# Navigator v2 — Index capacity submission evaluator v1

Дата: 22 июля 2026 года.

## Цель

Подготовить offline-инструмент для проверки будущей локальной копии заполненной capacity-input формы по кандидату `nav_deal_answers_v2_deal_idx`.

Каноническая форма остаётся незаполненной:

`config/nav-v2-index-capacity-input-decision-v1.json`

Evaluator не выбирает environment, scale, concurrency, runtime, observation cadence или thresholds. Он не подтверждает стоимость, не создаёт Supabase branch и не запускает benchmark.

## Файлы

Evaluator:

`scripts/evaluate_nav_v2_index_capacity_submission_v1.py`

Self-test и source boundary:

`scripts/check_nav_v2_index_capacity_submission_evaluator_v1.py`

Contract:

`config/nav-v2-index-capacity-submission-evaluator-v1.json`

## Входной контракт

На вход передаётся только локальная копия формы после отдельного заполнения и review владельцем и release manager.

Проверяются:

- точный список из 15 input blocks;
- допустимый environment;
- источник target scale;
- положительные числовые значения deals, answers, concurrency, headroom, runtime и observation days;
- неотрицательные thresholds;
- распределение `p50 ≤ p95 ≤ max_bounded`;
- timezone-aware submission/review timestamps;
- owner approval;
- release manager approval;
- явное обоснование каждого выбранного нулевого threshold;
- сохранение всех post-submission gates.

Evaluator не доверяет полям `submission_validation.form_valid`, `benchmark_execution_ready` или другим готовым итогам. Он пересчитывает verdict самостоятельно.

## Environment 1 — isolated PostgreSQL 17

Допустимое значение:

`isolated_ephemeral_postgresql_17`

Для него требуется:

- `approved_branch_compute_class=null`;
- все preview cost flags равны `false`;
- amount, currency, recurrence, cost confirmation и delete deadline равны `null`;
- production database и production rows запрещены.

## Environment 2 — disposable Supabase preview branch

Допустимое значение:

`owner_and_cost_approved_disposable_supabase_preview_branch`

Требуются:

- compute class из свежего cost response;
- runtime от 1 до 360 минут;
- fresh cost recheck;
- amount больше нуля;
- трёхбуквенная uppercase currency;
- recurrence `hourly`;
- стоимость показана владельцу;
- explicit owner cost approval;
- отдельный cost confirmation ID;
- timezone-aware automatic delete deadline после review;
- historical cost не переиспользуется.

Даже валидный preview input не вызывает `confirm_cost` и не создаёт branch.

## Нулевые thresholds

Значение `0` разрешено только для неотрицательных observation thresholds и требует отдельного текста:

`submission_rationale.zero_thresholds.<input_name>`

Пустой rationale делает форму невалидной. Evaluator не придумывает обоснование автоматически.

## Решения и exit codes

### Exit 0

`capacity_submission_valid_separate_execution_authorization_required`

Форма структурно валидна, approvals и environment gate присутствуют.

Это означает только готовность формы к следующему decision gate. По-прежнему требуется отдельное разрешение на benchmark.

### Exit 2

`capacity_submission_input_error`

Файл отсутствует, нечитаем или содержит повреждённый JSON.

### Exit 3

`capacity_submission_invalid_or_incomplete`

Не заполнены обязательные значения, нарушены типы, approvals, timestamps, distribution order или rationale.

### Exit 4

`capacity_submission_environment_or_cost_gate_invalid`

Environment-specific требования, fresh cost gate или шестичасовой lifetime нарушены.

### Exit 5

`capacity_submission_forbidden_authorization_claim`

Input пытается выставить хотя бы один запрещённый флаг:

- benchmark execution authorized/ready;
- cloud execution allowed;
- production DDL/DML authorized;
- production index removal ready;
- completed form itself authorizes execution.

Такой input отклоняется fail-closed.

## Report boundary

Отчёт содержит только:

- aggregate count заполненных inputs;
- выбранный environment;
- наличие owner/release approvals;
- decision;
- безопасные reason codes.

Отчёт не копирует:

- конкретные target values;
- rationale text;
- reviewer identifiers;
- cost confirmation ID;
- cost amount;
- timestamps.

Во всех отчётах принудительно остаются:

- `benchmark_execution_ready=false`;
- `production_index_removal_ready=false`;
- `production_ddl_ready=false`.

## Self-test matrix

Dedicated CI создаёт только временные synthetic copies и проверяет 13 случаев:

1. валидный isolated PostgreSQL submission;
2. валидный preview submission с synthetic fresh cost gate;
3. пропущенный required input;
4. недопустимое положительное число;
5. неверный distribution order;
6. нулевой threshold без rationale;
7. нулевой threshold с rationale;
8. отсутствующий preview cost gate;
9. preview runtime больше шести часов;
10. отсутствующий owner approval;
11. попытка авторизовать benchmark;
12. попытка объявить production index removal ready;
13. malformed JSON.

Synthetic значения существуют только во временной директории GitHub Actions и не коммитятся.

## Решение по package

`capacity_submission_evaluator_prepared_offline_canonical_form_unsubmitted`

Evaluator готов для будущей локальной копии формы.

Он не является разрешением на production DDL, production index removal, benchmark execution, Supabase preview branch или создание accounts/secrets.

## Следующие обязательные gates после валидной формы

- fresh read-only schema/statistics preflight;
- same-epoch observation evidence или явный restart;
- отдельное разрешение на benchmark;
- создание disposable environment только после соответствующего approval;
- synthetic dataset manifest/hash;
- cleanup evidence;
- authenticated regression;
- production `EXPLAIN ANALYZE` на approved non-PII fixtures;
- exact forward/rollback migration;
- отдельное owner production DDL approval.

## Границы

Не выполнялись:

- заполнение канонической формы;
- выбор capacity values;
- cost recheck или confirmation;
- создание branch/accounts/secrets;
- SQL, migrations, DDL или DML;
- production benchmark;
- production index removal;
- изменения `leader_*`.
