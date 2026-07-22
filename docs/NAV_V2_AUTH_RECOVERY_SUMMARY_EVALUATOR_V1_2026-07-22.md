# Navigator v2 — Redacted Auth recovery summary evaluator v1

Дата: 22 июля 2026 года.

## Цель

Подготовить reusable offline-инструмент для проверки будущих обезличенных Auth recovery срезов без доступа к Supabase, сети, аккаунтам и сырым логам.

Сырые логи запрещено передавать evaluator или сохранять в repository evidence.

Инструмент не получает Auth/API event messages. На вход принимается только заранее сформированный агрегированный JSON-summary.

## Файлы

Evaluator:

`scripts/evaluate_nav_v2_auth_recovery_summary_v1.py`

Self-test и source boundary:

`scripts/check_nav_v2_auth_recovery_summary_evaluator_v1.py`

Contract:

`config/nav-v2-auth-recovery-summary-evaluator-v1.json`

## Входной контракт

Обязательные поля:

- `schema_version=1`;
- `capture_mode=redacted_summary_only`;
- `raw_logs_included=false`;
- корректное UTC/offset capture window;
- минимум одна recovery sequence;
- privacy flags со значением `false`;
- aggregate security counters;
- claims, запрещающие E2E/production-ready выводы.

Допустимая recovery sequence:

1. `authenticated_rpc_401`;
2. `refresh_endpoint_200`;
3. `same_rpc_retry_200`.

Evaluator не принимает произвольные event payloads.

## Privacy validation

Fail-closed отклоняются:

- user/actor identifiers;
- ФИО и email;
- IP-адреса;
- request IDs;
- access/refresh tokens;
- Authorization material;
- headers и payloads;
- user-agent;
- raw event message;
- JWT-like values.

Отчёт не копирует входные события или значения. Он содержит только:

- verdict;
- aggregate counts;
- decision;
- безопасные reason codes;
- обязательные `authenticated_role_e2e_ready=false` и `production_change_ready=false`.

## Решения и exit codes

### Успех — exit 0

`redacted_auth_recovery_summary_valid_not_authenticated_role_e2e`

Условия:

- privacy и contract валидны;
- минимум одна полная recovery sequence;
- fresh invalid refresh events равны нулю;
- unexpected unauthenticated success равен нулю.

Это подтверждает только корректность обезличенного summary и отсутствие зафиксированной в нём регрессии.

### Input error — exit 2

`redacted_auth_summary_input_error`

Используется для отсутствующего, нечитаемого или повреждённого JSON.

### Invalid privacy/contract — exit 3

Privacy violation:

`redacted_auth_summary_invalid_privacy_violation`

Contract/sequence violation:

`redacted_auth_summary_invalid_contract_capture_required`

### Security regression — exit 4

`redacted_auth_recovery_regression_observed_manual_investigation_required`

Возвращается, если валидный обезличенный summary сообщает хотя бы об одном:

- fresh invalid refresh event;
- unexpected unauthenticated success.

Это fail-closed сигнал для ручного расследования. Он не запускает Auth changes, deployment или cleanup.

## Self-test matrix

Dedicated CI проверяет семь случаев:

1. валидная recovery sequence;
2. fresh invalid refresh regression;
3. unexpected unauthenticated success;
4. identifier/privacy violation;
5. incomplete recovery sequence;
6. запрещённый authenticated E2E claim;
7. malformed JSON.

## Security boundary

Workflow:

- имеет только `contents: read`;
- не читает Supabase logs;
- не вызывает Management API;
- не выполняет curl, wget, psql или Supabase CLI;
- не создаёт branch/accounts/secrets;
- не выполняет SQL, migrations или Edge deployment.

## Решение по package

`redacted_auth_summary_evaluator_prepared_offline_no_live_execution`

Evaluator готов для будущих вручную подготовленных redacted summaries.

Он не заменяет authenticated role E2E, live browser audit, реальный multi-tab test или проверку мобильного и desktop интерфейса.

## Границы

Не выполнялись:

- production Auth/RLS/grants changes;
- production DDL/DML;
- preview branch или cost confirmation;
- создание пользователей;
- изменения Edge Functions;
- изменения `leader_*`.
